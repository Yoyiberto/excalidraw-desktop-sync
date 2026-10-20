import React, { useState, useEffect, useRef, useCallback } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { DrawingSwitcher } from "./components/DrawingSwitcher";
import { SettingsModal } from "./components/SettingsModal";
import { ExcalidrawWrapper, InsertImagesFn } from "./components/ExcalidrawWrapper";
import { storage } from "./services/storage";
import { syncService } from "./services/sync";
import { DrawingData, DrawingMeta, SyncConfig, SyncStatusState } from "./types";

export const App: React.FC = () => {
  const [drawingsList, setDrawingsList] = useState<DrawingMeta[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<DrawingData | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>("Welcome");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    workerUrl: "https://draw-sync-worker.draw-sync-worker.workers.dev",
    authKey: "",
    autoSync: true,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>("not_configured");
  const [syncMessage, setSyncMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // Refs for stable callbacks without triggering re-render loops
  const activeDrawingRef = useRef<DrawingData | null>(null);
  const syncConfigRef = useRef<SyncConfig>(syncConfig);
  const saveTimeoutRef = useRef<any>(null);
  const syncTimeoutRef = useRef<any>(null);
  const excalidrawRef = useRef<any>(null);
  const insertImagesRef = useRef<InsertImagesFn | null>(null);

  // Keep refs synchronized
  useEffect(() => {
    activeDrawingRef.current = activeDrawing;
    if (activeDrawing) {
      setActiveTitle(activeDrawing.title);
    }
  }, [activeDrawing]);

  useEffect(() => {
    syncConfigRef.current = syncConfig;
  }, [syncConfig]);

  // Sync with Cloudflare
  const triggerSync = useCallback(async (cfg = syncConfigRef.current) => {
    if (!cfg.workerUrl || cfg.workerUrl.trim() === "") {
      setSyncStatus("not_configured");
      return;
    }

    setSyncStatus("syncing");
    setSyncMessage("Synchronizing with Cloudflare...");

    try {
      if (activeDrawingRef.current && activeDrawingRef.current.updatedAt > 0) {
        await storage.saveDrawing(activeDrawingRef.current);
      }

      const res = await syncService.syncAll(cfg);
      const updatedList = await storage.getDrawingsList();
      setDrawingsList(updatedList);

      // Refresh active drawing if updated from cloud
      const currentActive = activeDrawingRef.current;
      if (currentActive) {
        const refreshed = await storage.getDrawing(currentActive.id);
        if (refreshed && refreshed.updatedAt > currentActive.updatedAt) {
          setActiveDrawing(refreshed);
          activeDrawingRef.current = refreshed;
          setActiveTitle(refreshed.title);
          if (excalidrawRef.current) {
            excalidrawRef.current.updateScene({
              elements: refreshed.content?.elements || [],
              appState: {
                ...refreshed.content?.appState,
                collaborators: new Map(),
              },
            });
            if (refreshed.files) {
              excalidrawRef.current.addFiles(Object.values(refreshed.files));
            }
          }
        }
      }

      setSyncStatus("synced");
      setSyncMessage(
        res.count > 0 ? `Synced ${res.count} items successfully` : "Everything is up to date"
      );
    } catch (err: any) {
      console.error("Sync error:", err);
      setSyncStatus("error");
      setSyncMessage(err.message || "Failed to sync");
    }
  }, []);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        const config = await storage.getSyncConfig();
        setSyncConfig(config);
        syncConfigRef.current = config;

        if (!config.workerUrl || config.workerUrl.trim() === "") {
          setSyncStatus("not_configured");
        } else {
          setSyncStatus("idle");
        }

        // 1. Initial sync with cloud if configured, to fetch remote drawings before defaults
        if (config.workerUrl && config.autoSync) {
          setSyncStatus("syncing");
          setSyncMessage("Checking Cloudflare for drawings...");
          try {
            await syncService.syncAll(config);
          } catch (e: any) {
            console.warn("Initial sync error:", e);
          }
        }

        // 2. Load drawings list
        let list = await storage.getDrawingsList();

        // 3. Determine active drawing
        let drawing: DrawingData;
        if (list.length > 0) {
          const activeId = await storage.getActiveDrawingId();
          const targetId = activeId && list.some((d) => d.id === activeId) ? activeId : list[0].id;
          drawing = (await storage.getDrawing(targetId)) || (await storage.initializeDefaults());
        } else {
          drawing = await storage.initializeDefaults();
          list = await storage.getDrawingsList();
        }

        setActiveDrawing(drawing);
        activeDrawingRef.current = drawing;
        setActiveTitle(drawing.title);
        setDrawingsList(list);

        if (config.workerUrl) {
          setSyncStatus("synced");
          setSyncMessage("Everything is up to date");
        }
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Canvas Change Handler (Debounced auto-save & sync - STABLE, NO STATE RE-RENDER LOOP)
  const handleCanvasChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      const current = activeDrawingRef.current;
      if (!current) return;

      const updatedDrawing: DrawingData = {
        ...current,
        content: {
          elements: [...elements],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            currentItemFontFamily: appState.currentItemFontFamily,
          },
        },
        files: files || {},
        updatedAt: Date.now(),
      };

      activeDrawingRef.current = updatedDrawing;

      // Debounced local save (500ms)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        await storage.saveDrawing(updatedDrawing);
        const list = await storage.getDrawingsList();
        setDrawingsList(list);
      }, 500);

      // Debounced Cloudflare sync (2500ms)
      const currentCfg = syncConfigRef.current;
      if (currentCfg.workerUrl && currentCfg.autoSync) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(async () => {
          try {
            setSyncStatus("syncing");
            await syncService.uploadDrawing(currentCfg, updatedDrawing);
            setSyncStatus("synced");
            setSyncMessage("Saved to Cloudflare");
          } catch (err: any) {
            setSyncStatus("error");
            setSyncMessage(err.message || "Cloudflare upload failed");
          }
        }, 2500);
      }
    },
    []
  );

  // Switch to another drawing
  const handleSelectDrawing = async (id: string) => {
    if (activeDrawingRef.current && activeDrawingRef.current.id === id) return;

    if (activeDrawingRef.current) {
      await storage.saveDrawing(activeDrawingRef.current);
    }

    const next = await storage.getDrawing(id);
    if (next) {
      setActiveDrawing(next);
      activeDrawingRef.current = next;
      setActiveTitle(next.title);
      await storage.setActiveDrawingId(next.id);
    }
  };

  // Create a new drawing
  const handleNewDrawing = async () => {
    if (activeDrawingRef.current) {
      await storage.saveDrawing(activeDrawingRef.current);
    }

    const newId = `drawing-${Date.now()}`;
    const newDrawing: DrawingData = {
      id: newId,
      title: `Drawing ${drawingsList.length + 1}`,
      content: {
        elements: [],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
      },
      files: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveDrawing(newDrawing);
    await storage.setActiveDrawingId(newId);
    setActiveDrawing(newDrawing);
    activeDrawingRef.current = newDrawing;
    setActiveTitle(newDrawing.title);

    const list = await storage.getDrawingsList();
    setDrawingsList(list);

    const currentCfg = syncConfigRef.current;
    if (currentCfg.workerUrl && currentCfg.autoSync) {
      syncService.uploadDrawing(currentCfg, newDrawing).catch(console.error);
    }
  };

  // Rename drawing
  const handleRenameDrawing = async (id: string, newTitle: string) => {
    const drawing = await storage.getDrawing(id);
    if (drawing) {
      const updated = { ...drawing, title: newTitle, updatedAt: Date.now() };
      await storage.saveDrawing(updated);

      if (activeDrawingRef.current && activeDrawingRef.current.id === id) {
        activeDrawingRef.current = updated;
        setActiveTitle(newTitle);
      }

      const list = await storage.getDrawingsList();
      setDrawingsList(list);

      const currentCfg = syncConfigRef.current;
      if (currentCfg.workerUrl && currentCfg.autoSync) {
        syncService.uploadDrawing(currentCfg, updated).catch(console.error);
      }
    }
  };

  // Duplicate drawing
  const handleDuplicateDrawing = async (id: string) => {
    const source = await storage.getDrawing(id);
    if (!source) return;

    const newId = `drawing-${Date.now()}`;
    const duplicate: DrawingData = {
      ...source,
      id: newId,
      title: `${source.title} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.saveDrawing(duplicate);
    const list = await storage.getDrawingsList();
    setDrawingsList(list);

    const currentCfg = syncConfigRef.current;
    if (currentCfg.workerUrl && currentCfg.autoSync) {
      syncService.uploadDrawing(currentCfg, duplicate).catch(console.error);
    }
  };

  // Delete drawing
  const handleDeleteDrawing = async (id: string) => {
    await storage.deleteDrawing(id);
    const updatedList = await storage.getDrawingsList();
    setDrawingsList(updatedList);

    const currentCfg = syncConfigRef.current;
    if (currentCfg.workerUrl && currentCfg.autoSync) {
      syncService.deleteRemoteDrawing(currentCfg, id).catch(console.error);
    }

    if (activeDrawingRef.current && activeDrawingRef.current.id === id) {
      if (updatedList.length > 0) {
        const next = await storage.getDrawing(updatedList[0].id);
        if (next) {
          setActiveDrawing(next);
          activeDrawingRef.current = next;
          setActiveTitle(next.title);
          await storage.setActiveDrawingId(next.id);
        }
      } else {
        await handleNewDrawing();
      }
    }
  };

  // Export as .excalidraw file
  const handleExportDrawing = async (id: string) => {
    const drawing = await storage.getDrawing(id);
    if (!drawing) return;

    const exportData = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: drawing.content?.elements || [],
      appState: drawing.content?.appState || {},
      files: drawing.files || {},
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${drawing.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.excalidraw`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import .excalidraw file
  const handleImportDrawing = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const newId = `drawing-${Date.now()}`;
      const title = file.name.replace(/\.excalidraw$/i, "").replace(/\.json$/i, "") || "Imported Drawing";

      const newDrawing: DrawingData = {
        id: newId,
        title,
        content: {
          elements: Array.isArray(data.elements) ? data.elements : [],
          appState: data.appState || { viewBackgroundColor: "#ffffff" },
        },
        files: data.files || {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveDrawing(newDrawing);
      await storage.setActiveDrawingId(newId);
      setActiveDrawing(newDrawing);
      activeDrawingRef.current = newDrawing;
      setActiveTitle(newDrawing.title);

      const list = await storage.getDrawingsList();
      setDrawingsList(list);

      const currentCfg = syncConfigRef.current;
      if (currentCfg.workerUrl && currentCfg.autoSync) {
        syncService.uploadDrawing(currentCfg, newDrawing).catch(console.error);
      }
    } catch (err: any) {
      console.error("Failed to import drawing:", err);
      alert("Failed to parse .excalidraw file: " + (err.message || "Invalid file"));
    }
  };

  // Save Settings
  const handleSaveSettings = async (newConfig: SyncConfig) => {
    setSyncConfig(newConfig);
    syncConfigRef.current = newConfig;
    await storage.saveSyncConfig(newConfig);

    if (newConfig.workerUrl) {
      triggerSync(newConfig);
    } else {
      setSyncStatus("not_configured");
    }
  };

  if (loading || !activeDrawing) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
        Loading Excalidraw Desktop...
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header bar */}
      <HeaderBar
        title={activeTitle}
        onTitleChange={(newTitle) => handleRenameDrawing(activeDrawing.id, newTitle)}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onNewDrawing={handleNewDrawing}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onTriggerSync={() => triggerSync()}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        onInsertImages={(files, quality) => insertImagesRef.current?.(files, quality)}
      />

      {/* Main Drawing Canvas */}
      <main className="flex-1 w-full h-full relative">
        <ExcalidrawWrapper
          key={activeDrawing.id}
          drawing={activeDrawing}
          onChange={handleCanvasChange}
          excalidrawRef={excalidrawRef}
          insertImagesRef={insertImagesRef}
        />
      </main>

      {/* Drawing Switcher Drawer */}
      <DrawingSwitcher
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        drawings={drawingsList}
        activeId={activeDrawing.id}
        onSelectDrawing={handleSelectDrawing}
        onNewDrawing={handleNewDrawing}
        onImportDrawing={handleImportDrawing}
        onRenameDrawing={handleRenameDrawing}
        onDuplicateDrawing={handleDuplicateDrawing}
        onDeleteDrawing={handleDeleteDrawing}
        onExportDrawing={handleExportDrawing}
      />

      {/* Cloudflare Sync Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={syncConfig}
        onSaveConfig={handleSaveSettings}
      />
    </div>
  );
};
export default App;
