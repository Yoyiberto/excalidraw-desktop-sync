import React, { useEffect, useState, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { DrawingData } from "../types";

interface ExcalidrawWrapperProps {
  drawing: DrawingData;
  onChange: (elements: readonly any[], appState: any, files: any) => void;
  excalidrawRef?: React.MutableRefObject<any>;
}

export const ExcalidrawWrapper: React.FC<ExcalidrawWrapperProps> = ({
  drawing,
  onChange,
  excalidrawRef,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const currentDrawingIdRef = useRef<string>(drawing.id);

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

  return (
    <div className="w-full h-[calc(100vh-3rem)] relative">
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
    </div>
  );
};
