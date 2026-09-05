export interface DrawingMeta {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  size?: number;
  localOnly?: boolean;
}

export interface DrawingData {
  id: string;
  title: string;
  content: {
    elements?: any[];
    appState?: Record<string, any>;
    version?: number;
  };
  files: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface SyncConfig {
  workerUrl: string;
  authKey: string;
  autoSync: boolean;
}

export type SyncStatusState = "idle" | "syncing" | "synced" | "error" | "offline" | "not_configured";
