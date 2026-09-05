import { DrawingData, DrawingMeta, SyncConfig } from "../types";
import { storage } from "./storage";

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
    return url.replace(/\/+$/, "");
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
        files: drawing.files,
        updatedAt: drawing.updatedAt,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${res.status} - ${errorText}`);
    }
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
      files: data.files || {},
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
      const localDrawing = await storage.getDrawing(localMeta.id);
      if (localDrawing) {
        await this.uploadDrawing(config, localDrawing);
        syncCount++;
      }
    }

    return { count: syncCount };
  },
};
