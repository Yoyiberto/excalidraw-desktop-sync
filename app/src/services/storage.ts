import { get, set, del } from "idb-keyval";
import { DrawingData, DrawingMeta, SyncConfig } from "../types";

const DRAWING_PREFIX = "draw_content_";
const METADATA_KEY = "draw_metadata_list";
const CONFIG_KEY = "draw_sync_config";
const ACTIVE_ID_KEY = "draw_active_id";

export const storage = {
  // Sync Configuration
  async getSyncConfig(): Promise<SyncConfig> {
    const config = await get<SyncConfig>(CONFIG_KEY);
    return (
      config || {
        workerUrl: "https://draw-sync-worker.draw-sync-worker.workers.dev",
        authKey: "",
        autoSync: true,
      }
    );
  },

  async saveSyncConfig(config: SyncConfig): Promise<void> {
    await set(CONFIG_KEY, config);
  },

  // Active Drawing ID
  async getActiveDrawingId(): Promise<string | null> {
    return (await get<string>(ACTIVE_ID_KEY)) || null;
  },

  async setActiveDrawingId(id: string): Promise<void> {
    await set(ACTIVE_ID_KEY, id);
  },

  // Metadata list of drawings
  async getDrawingsList(): Promise<DrawingMeta[]> {
    const list = await get<DrawingMeta[]>(METADATA_KEY);
    return list || [];
  },

  async saveDrawingsList(list: DrawingMeta[]): Promise<void> {
    await set(METADATA_KEY, list);
  },

  // Single Drawing content
  async getDrawing(id: string): Promise<DrawingData | null> {
    const data = await get<DrawingData>(`${DRAWING_PREFIX}${id}`);
    return data || null;
  },

  async saveDrawing(drawing: DrawingData): Promise<void> {
    await set(`${DRAWING_PREFIX}${drawing.id}`, drawing);

    // Update metadata list
    const list = await this.getDrawingsList();
    const index = list.findIndex((d) => d.id === drawing.id);
    const contentStr = JSON.stringify(drawing.content);
    const meta: DrawingMeta = {
      id: drawing.id,
      title: drawing.title,
      created_at: drawing.createdAt,
      updated_at: drawing.updatedAt,
      size: contentStr.length,
    };

    if (index >= 0) {
      list[index] = meta;
    } else {
      list.unshift(meta);
    }

    await this.saveDrawingsList(list);
  },

  async deleteDrawing(id: string): Promise<void> {
    await del(`${DRAWING_PREFIX}${id}`);
    const list = await this.getDrawingsList();
    const updated = list.filter((d) => d.id !== id);
    await this.saveDrawingsList(updated);
  },

  // Initial demo drawing if empty
  async initializeDefaults(): Promise<DrawingData> {
    const list = await this.getDrawingsList();
    if (list.length > 0) {
      const activeId = await this.getActiveDrawingId();
      const targetId = activeId && list.some((d) => d.id === activeId) ? activeId : list[0].id;
      const current = await this.getDrawing(targetId);
      if (current) return current;
    }

    const defaultDrawing: DrawingData = {
      id: "welcome-board",
      title: "Welcome to Excalidraw",
      content: {
        elements: [
          {
            id: "welcome-rect",
            type: "rectangle",
            x: 200,
            y: 150,
            width: 480,
            height: 220,
            strokeColor: "#1e1e1e",
            backgroundColor: "#e0f2fe",
            fillStyle: "solid",
            strokeWidth: 2,
            roughness: 1,
            roundness: { type: 3 },
            seed: 12345,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
          },
          {
            id: "welcome-text",
            type: "text",
            x: 220,
            y: 180,
            width: 440,
            height: 150,
            fontSize: 20,
            fontFamily: 1,
            text: "🎨 Welcome to Excalidraw Desktop!\n\n• Fast offline drawing with Rust / Tauri\n• Cloudflare D1/R2 sync\n• Switch multiple drawings seamlessly",
            strokeColor: "#0f172a",
            textAlign: "left",
            verticalAlign: "top",
            seed: 67890,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
          },
        ],
        appState: {
          viewBackgroundColor: "#ffffff",
          currentItemFontFamily: 1,
        },
      },
      files: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveDrawing(defaultDrawing);
    await this.setActiveDrawingId(defaultDrawing.id);
    return defaultDrawing;
  },
};
