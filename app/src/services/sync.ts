import { DrawingData, DrawingMeta, SyncConfig } from "../types";
import { storage } from "./storage";

// Worker URLs that answered 503 on an asset upload (no R2 bucket bound) during this session;
// drawings synced to them keep their dataURLs inline in files_json like before.
const r2Unavailable = new Set<string>();

function dataURLToBlob(dataURL: string): Blob {
  const [header, data] = dataURL.split(",", 2);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
  if (!header.includes(";base64")) {
    return new Blob([decodeURIComponent(data)], { type: mimeType });
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const syncService = {
  getHeaders(config: SyncConfig): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.authKey && config.authKey.trim() !== "") {
      headers["Authorization"] = `Bearer ${config.authKey.trim()}`;
    }
    return headers;
  },

  cleanUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
  },

  async testConnection(config: SyncConfig): Promise<{ ok: boolean; message: string }> {
    if (!config.workerUrl || config.workerUrl.trim() === "") {
      return { ok: false, message: "Worker URL is empty" };
    }

    try {
      const baseUrl = this.cleanUrl(config.workerUrl);
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: this.getHeaders(config),
      });

      if (!res.ok) {
        return { ok: false, message: `Server returned status ${res.status}` };
      }

      const data = await res.json();
      return { ok: true, message: `Connected! Cloudflare Worker v${data.service || "ok"}` };
    } catch (err: any) {
      return { ok: false, message: err.message || "Failed to reach worker" };
    }
  },

  async uploadDrawing(config: SyncConfig, drawing: DrawingData): Promise<void> {
    if (!config.workerUrl || config.workerUrl.trim() === "") return;

    const baseUrl = this.cleanUrl(config.workerUrl);
    const res = await fetch(`${baseUrl}/api/drawings/${encodeURIComponent(drawing.id)}`, {
      method: "PUT",
      headers: this.getHeaders(config),
      body: JSON.stringify({
        title: drawing.title,
        content: drawing.content,
        files: await this.uploadFiles(config, drawing.files || {}),
        updatedAt: drawing.updatedAt,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${res.status} - ${errorText}`);
    }
  },

  // Uploads to R2 the files it doesn't have yet and returns the files map for D1 without dataURLs.
  // Falls back to the full map (dataURLs inline) when the worker has no R2 bucket.
  async uploadFiles(config: SyncConfig, files: Record<string, any>): Promise<Record<string, any>> {
    const entries = Object.entries(files);
    const baseUrl = this.cleanUrl(config.workerUrl);
    if (entries.length === 0 || r2Unavailable.has(baseUrl)) return files;

    const uploaded = await storage.getUploadedAssets(baseUrl);
    let changed = false;
    try {
      for (const [id, file] of entries) {
        if (!file?.dataURL || uploaded.has(id)) continue;
        const blob = dataURLToBlob(file.dataURL);
        const headers = this.getHeaders(config) as Record<string, string>;
        headers["Content-Type"] = file.mimeType || blob.type;
        const res = await fetch(`${baseUrl}/api/assets/${encodeURIComponent(id)}`, {
          method: "POST",
          headers,
          body: blob,
        });
        if (res.status === 503) {
          r2Unavailable.add(baseUrl);
          return files;
        }
        if (!res.ok) {
          throw new Error(`Asset upload failed: ${res.status} - ${await res.text()}`);
        }
        uploaded.add(id);
        changed = true;
      }
    } finally {
      if (changed) await storage.saveUploadedAssets(baseUrl, uploaded);
    }

    const meta: Record<string, any> = {};
    for (const [id, file] of entries) {
      const { dataURL: _dataURL, ...rest } = file || {};
      meta[id] = rest;
    }
    return meta;
  },

  // Fills in dataURLs for files that came from D1 as metadata only: reuses the local copy
  // when there is one, otherwise downloads the asset from R2.
  async downloadMissingFiles(
    config: SyncConfig,
    id: string,
    remoteFiles: Record<string, any>
  ): Promise<Record<string, any>> {
    const baseUrl = this.cleanUrl(config.workerUrl);
    const localFiles = (await storage.getDrawing(id))?.files || {};
    const uploaded = await storage.getUploadedAssets(baseUrl);
    let changed = false;
    const result: Record<string, any> = {};

    for (const [fileId, file] of Object.entries(remoteFiles)) {
      if (file?.dataURL) {
        result[fileId] = file;
        continue;
      }
      const local = localFiles[fileId];
      if (local?.dataURL) {
        result[fileId] = { ...local, ...file, dataURL: local.dataURL };
        continue;
      }
      try {
        const res = await fetch(`${baseUrl}/api/assets/${encodeURIComponent(fileId)}`, {
          headers: this.getHeaders(config),
        });
        if (!res.ok) {
          console.warn(`Asset ${fileId} unavailable: status ${res.status}`);
          continue;
        }
        const blob = await res.blob();
        const typed = file?.mimeType && blob.type !== file.mimeType ? new Blob([blob], { type: file.mimeType }) : blob;
        result[fileId] = { ...file, id: fileId, mimeType: typed.type, dataURL: await blobToDataURL(typed) };
        uploaded.add(fileId);
        changed = true;
      } catch (err) {
        console.warn(`Asset ${fileId} download failed:`, err);
      }
    }

    if (changed) await storage.saveUploadedAssets(baseUrl, uploaded);
    return result;
  },

  async fetchRemoteDrawing(config: SyncConfig, id: string): Promise<DrawingData> {
    const baseUrl = this.cleanUrl(config.workerUrl);
    const res = await fetch(`${baseUrl}/api/drawings/${encodeURIComponent(id)}`, {
      headers: this.getHeaders(config),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch drawing ${id}: status ${res.status}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      content: data.content,
      files: await this.downloadMissingFiles(config, id, data.files || {}),
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    };
  },

  async deleteRemoteDrawing(config: SyncConfig, id: string): Promise<void> {
    if (!config.workerUrl || config.workerUrl.trim() === "") return;

    const baseUrl = this.cleanUrl(config.workerUrl);
    const res = await fetch(`${baseUrl}/api/drawings/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(config),
    });

    if (!res.ok) {
      throw new Error(`Failed to delete remote drawing: status ${res.status}`);
    }
  },

  async syncAll(config: SyncConfig): Promise<{ count: number; error?: string }> {
    if (!config.workerUrl || config.workerUrl.trim() === "") {
      return { count: 0 };
    }

    const baseUrl = this.cleanUrl(config.workerUrl);
    const res = await fetch(`${baseUrl}/api/drawings`, {
      headers: this.getHeaders(config),
    });

    if (!res.ok) {
      throw new Error(`Sync failed: status ${res.status}`);
    }

    const data = (await res.json()) as { drawings: any[] };
    const remoteList = data.drawings || [];

    const localList = await storage.getDrawingsList();
    let syncCount = 0;

    // Map of local items by id
    const localMap = new Map<string, DrawingMeta>();
    localList.forEach((d) => localMap.set(d.id, d));

    // 1. Process remote drawings
    for (const remote of remoteList) {
      const local = localMap.get(remote.id);

      if (!local) {
        // We don't have this remote drawing locally, download it
        const fullDrawing = await this.fetchRemoteDrawing(config, remote.id);
        await storage.saveDrawing(fullDrawing);
        syncCount++;
      } else if (remote.updated_at > local.updated_at) {
        // Remote is newer than local, download it
        const fullDrawing = await this.fetchRemoteDrawing(config, remote.id);
        await storage.saveDrawing(fullDrawing);
        syncCount++;
      } else if (local.updated_at > remote.updated_at) {
        // Local is newer than remote, upload it
        const localDrawing = await storage.getDrawing(local.id);
        if (localDrawing) {
          await this.uploadDrawing(config, localDrawing);
          syncCount++;
        }
      }
      localMap.delete(remote.id);
    }

    // 2. Upload drawings that exist only locally
    for (const [_, localMeta] of localMap) {
      // Do not upload untouched default welcome template
      if (localMeta.updated_at === 0 && localMeta.id === "welcome-board") {
        continue;
      }
      const localDrawing = await storage.getDrawing(localMeta.id);
      if (localDrawing) {
        await this.uploadDrawing(config, localDrawing);
        syncCount++;
      }
    }

    return { count: syncCount };
  },
};
