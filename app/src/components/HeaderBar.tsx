import React, { useState } from "react";
import { Folder, Plus, Settings, RefreshCw, Check, AlertCircle, CloudOff } from "lucide-react";
import { SyncStatusState } from "../types";

interface HeaderBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  onOpenSidebar: () => void;
  onNewDrawing: () => void;
  onOpenSettings: () => void;
  onTriggerSync: () => void;
  syncStatus: SyncStatusState;
  syncMessage: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  onTitleChange,
  onOpenSidebar,
  onNewDrawing,
  onOpenSettings,
  onTriggerSync,
  syncStatus,
  syncMessage,
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
