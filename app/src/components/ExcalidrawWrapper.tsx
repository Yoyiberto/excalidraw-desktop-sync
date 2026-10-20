import React, { useEffect, useState, useRef } from "react";
import {
  Excalidraw,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { DrawingData } from "../types";
import {
  ImageQuality,
  IMAGE_PRESETS,
  getDefaultImageQuality,
  isOptimizableImage,
  optimizeImage,
  blobToDataURL,
  hashBlob,
  formatBytes,
} from "../services/imageOptimizer";

export type InsertImagesFn = (files: File[], quality: ImageQuality) => void;

interface ExcalidrawWrapperProps {
  drawing: DrawingData;
  onChange: (elements: readonly any[], appState: any, files: any) => void;
  excalidrawRef?: React.MutableRefObject<any>;
  insertImagesRef?: React.MutableRefObject<InsertImagesFn | null>;
}

// D1 stores the whole drawing in one row (~2 MB max), images included.
const LARGE_IMAGE_BYTES = 1.5 * 1024 * 1024;

const isWritable = (el: Element | null) =>
  !!el &&
  (el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement).isContentEditable);

export const ExcalidrawWrapper: React.FC<ExcalidrawWrapperProps> = ({
  drawing,
  onChange,
  excalidrawRef,
  insertImagesRef,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const currentDrawingIdRef = useRef<string>(drawing.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const forceOriginalRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Expose API to parent if ref provided
  useEffect(() => {
    if (excalidrawRef && excalidrawAPI) {
      excalidrawRef.current = excalidrawAPI;
    }
  }, [excalidrawAPI, excalidrawRef]);

  // When active drawing changes, update the canvas scene
  useEffect(() => {
    if (excalidrawAPI && drawing) {
      if (currentDrawingIdRef.current !== drawing.id) {
        currentDrawingIdRef.current = drawing.id;
        excalidrawAPI.updateScene({
          elements: drawing.content?.elements || [],
          appState: {
            ...drawing.content?.appState,
            collaborators: new Map(),
          },
        });
        if (drawing.files) {
          excalidrawAPI.addFiles(Object.values(drawing.files));
        }
      }
    }
  }, [drawing.id, excalidrawAPI]);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Optimized replacement for Excalidraw's own image insertion (which keeps the
  // source format and caps everything at 1440 px, even when you want the original).
  const insertImages = async (
    files: File[],
    quality: ImageQuality,
    at?: { clientX: number; clientY: number }
  ) => {
    const api = excalidrawAPI;
    if (!api || files.length === 0) return;

    const appState = api.getAppState();
    const point = at ?? {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    };
    const center = viewportCoordsToSceneCoords(point, appState);
    // Same on-screen size rule Excalidraw uses, so the chosen quality doesn't change layout.
    const maxHeight = Math.min(
      Math.max(appState.height - 120, 160),
      Math.floor(appState.height * 0.5) / appState.zoom.value
    );

    const newElements: any[] = [];
    let before = 0;
    let after = 0;
    let anyConverted = false;

    for (const [i, file] of files.entries()) {
      try {
        const img = await optimizeImage(file, quality);
        const fileId = await hashBlob(img.blob);
        const dataURL = await blobToDataURL(img.blob);
        api.addFiles([
          {
            id: fileId,
            dataURL,
            mimeType: img.blob.type || file.type,
            created: Date.now(),
            lastRetrieved: Date.now(),
          },
        ]);

        const height = Math.min(img.height, maxHeight);
        const width = height * (img.width / img.height);
        const offset = (i * 24) / appState.zoom.value;
        newElements.push(
          ...convertToExcalidrawElements([
            {
              type: "image",
              fileId: fileId as any,
              status: "saved",
              x: center.x - width / 2 + offset,
              y: center.y - height / 2 + offset,
              width,
              height,
            },
          ])
        );
        before += img.originalBytes;
        after += img.blob.size;
        anyConverted ||= img.converted;
      } catch (err) {
        console.error("Image insert failed:", err);
        showToast(`Could not insert ${file.name || "image"}`);
      }
    }
    if (newElements.length === 0) return;

    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...newElements],
      appState: {
        selectedElementIds: Object.fromEntries(newElements.map((el) => [el.id, true])),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const preset = IMAGE_PRESETS[quality];
    let msg = anyConverted
      ? `Image optimized: ${formatBytes(before)} → ${formatBytes(after)} (${preset.hint})`
      : `Image inserted (${quality === "original" ? "original" : "already optimal"}, ${formatBytes(after)})`;
    if (quality !== "original") msg += " · Ctrl+Shift+V pastes original";
    if (after > LARGE_IMAGE_BYTES) msg += " · Large image: cloud sync may fail";
    showToast(msg);
  };

  const insertImagesLatest = useRef(insertImages);
  insertImagesLatest.current = insertImages;

  useEffect(() => {
    if (insertImagesRef) {
      insertImagesRef.current = (files, quality) => insertImagesLatest.current(files, quality);
    }
  }, [insertImagesRef]);

  // Intercept image paste/drop before Excalidraw handles it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    };
    const onPointerLeave = () => {
      lastPointerRef.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      forceOriginalRef.current = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "v";
    };

    const onPaste = (e: ClipboardEvent) => {
      const forceOriginal = forceOriginalRef.current;
      forceOriginalRef.current = false;

      const target = document.activeElement;
      if (!container.contains(target) || isWritable(target)) return;
      const data = e.clipboardData;
      const file = data?.files[0];
      if (!isOptimizableImage(file)) return;
      // Spreadsheet copies carry an image too; let Excalidraw offer its chart dialog.
      if (data!.getData("text/plain").includes("\t")) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      const files = Array.from(data!.files).filter(isOptimizableImage);
      insertImagesLatest.current(
        files,
        forceOriginal ? "original" : getDefaultImageQuality(),
        lastPointerRef.current ?? undefined
      );
    };

    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files || []).filter(isOptimizableImage);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      insertImagesLatest.current(files, e.shiftKey ? "original" : getDefaultImageQuality(), {
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("drop", onDrop, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("drop", onDrop, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-[calc(100vh-3rem)] relative">
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        initialData={{
          elements: drawing.content?.elements || [],
          appState: {
            ...drawing.content?.appState,
            viewBackgroundColor: drawing.content?.appState?.viewBackgroundColor || "#ffffff",
          },
          files: drawing.files || {},
        }}
        onChange={(elements, appState, files) => {
          onChange(elements, appState, files);
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false, // Managed by our drawing switcher
            saveAsImage: true,
          },
        }}
      />
      {toast && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 text-xs font-medium text-white bg-gray-900/85 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};
