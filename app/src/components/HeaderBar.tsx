import React, { useState, useRef, useEffect } from "react";
import {
  Folder,
  Plus,
  Settings,
  RefreshCw,
  Check,
  AlertCircle,
  CloudOff,
  ImagePlus,
  ChevronDown,
} from "lucide-react";
import { SyncStatusState } from "../types";
import {
  ImageQuality,
  IMAGE_PRESETS,
  getDefaultImageQuality,
  setDefaultImageQuality,
} from "../services/imageOptimizer";

interface HeaderBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  onOpenSidebar: () => void;
  onNewDrawing: () => void;
  onOpenSettings: () => void;
  onTriggerSync: () => void;
  syncStatus: SyncStatusState;
  syncMessage: string;
  onInsertImages: (files: File[], quality: ImageQuality) => void;
}

const QUALITIES: ImageQuality[] = ["standard", "hd", "original"];

const ImageMenu: React.FC<{ onInsertImages: HeaderBarProps["onInsertImages"] }> = ({
  onInsertImages,
}) => {
  const [open, setOpen] = useState(false);
  const [defaultQuality, setDefaultQuality] = useState<ImageQuality>(getDefaultImageQuality);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingQualityRef = useRef<ImageQuality>("standard");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (q: ImageQuality) => {
    pendingQualityRef.current = q;
    setOpen(false);
    fileInputRef.current?.click();
  };

  return (
    <div className="relative" ref={menuRef}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) onInsertImages(files, pendingQualityRef.current);
        }}
      />
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-lg transition-colors"
        title="Insert image / paste quality"
      >
        <ImagePlus className="w-4 h-4 text-indigo-600" />
        <span className="hidden md:inline">Image</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-1.5 text-sm">
          <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Insert image file as
          </div>
          {QUALITIES.map((q) => (
            <button
              key={q}
              onClick={() => pick(q)}
              className="w-full flex items-baseline justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-left"
            >
              <span className="font-medium text-gray-800">{IMAGE_PRESETS[q].label}</span>
              <span className="text-xs text-gray-500">{IMAGE_PRESETS[q].hint}</span>
            </button>
          ))}
          <div className="my-1.5 border-t border-gray-100" />
          <div className="px-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Default for paste &amp; drop
          </div>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {QUALITIES.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setDefaultImageQuality(q);
                  setDefaultQuality(q);
                }}
                className={`py-1 rounded-md text-xs font-semibold border transition-colors ${
                  defaultQuality === q
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {IMAGE_PRESETS[q].label}
              </button>
            ))}
          </div>
          <p className="px-2 pb-1 text-[11px] leading-snug text-gray-500">
            Ctrl+Shift+V or Shift+drop inserts the original instead.
          </p>
        </div>
      )}
    </div>
  );
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  onTitleChange,
  onOpenSidebar,
  onNewDrawing,
  onOpenSettings,
  onTriggerSync,
  syncStatus,
  syncMessage,
  onInsertImages,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  const handleTitleSubmit = () => {
    if (tempTitle.trim() && tempTitle !== title) {
      onTitleChange(tempTitle.trim());
    } else {
      setTempTitle(title);
    }
    setIsEditingTitle(false);
  };

  React.useEffect(() => {
    setTempTitle(title);
  }, [title]);

  const renderSyncBadge = () => {
    switch (syncStatus) {
      case "syncing":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Syncing...
          </span>
        );
      case "synced":
        return (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full cursor-pointer hover:bg-emerald-100"
            title={syncMessage || "All changes synced with Cloudflare"}
            onClick={onTriggerSync}
          >
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            Cloud Synced
          </span>
        );
      case "error":
        return (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full cursor-pointer hover:bg-red-100"
            title={syncMessage || "Sync error, click to retry"}
            onClick={onTriggerSync}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            Sync Error
          </span>
        );
      case "not_configured":
      default:
        return (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-full cursor-pointer hover:bg-gray-200"
            title="Cloudflare Sync not configured. Click settings to set up."
            onClick={onOpenSettings}
          >
            <CloudOff className="w-3.5 h-3.5 text-gray-500" />
            Local Only
          </span>
        );
    }
  };

  return (
    <header className="h-12 bg-white border-b border-gray-200 px-3 flex items-center justify-between z-30 select-none shadow-sm">
      {/* Left section: Drawing Switcher Trigger & Title */}
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="" className="w-7 h-7 shrink-0" draggable={false} />
        <button
          onClick={onOpenSidebar}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-lg transition-colors"
          title="Open Drawings List (Switch or create drawings)"
        >
          <Folder className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">Drawings</span>
        </button>

        <button
          onClick={onNewDrawing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg transition-colors shadow-sm"
          title="Create New Drawing"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        <ImageMenu onInsertImages={onInsertImages} />

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* In-place Editable Title */}
        {isEditingTitle ? (
          <input
            type="text"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSubmit();
              if (e.key === "Escape") {
                setTempTitle(title);
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            className="px-2 py-1 text-sm font-semibold text-gray-800 border border-indigo-400 rounded outline-none focus:ring-2 focus:ring-indigo-300"
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 rounded truncate max-w-[240px] md:max-w-md transition-colors"
            title="Click to rename drawing"
          >
            {title}
          </button>
        )}
      </div>

      {/* Right section: Sync Badge & Settings */}
      <div className="flex items-center gap-2">
        {renderSyncBadge()}

        {syncStatus !== "not_configured" && (
          <button
            onClick={onTriggerSync}
            className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Sync Now with Cloudflare"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Cloudflare Sync Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
