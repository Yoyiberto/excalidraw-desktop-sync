import React, { useState } from "react";
import {
  X,
  Plus,
  Search,
  FileText,
  Trash2,
  Copy,
  Edit2,
  Download,
  Calendar,
  HardDrive,
} from "lucide-react";
import { DrawingMeta } from "../types";

interface DrawingSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  drawings: DrawingMeta[];
  activeId: string;
  onSelectDrawing: (id: string) => void;
  onNewDrawing: () => void;
  onRenameDrawing: (id: string, newTitle: string) => void;
  onDuplicateDrawing: (id: string) => void;
  onDeleteDrawing: (id: string) => void;
  onExportDrawing: (id: string) => void;
}

export const DrawingSwitcher: React.FC<DrawingSwitcherProps> = ({
  isOpen,
  onClose,
  drawings,
  activeId,
  onSelectDrawing,
  onNewDrawing,
  onRenameDrawing,
  onDuplicateDrawing,
  onDeleteDrawing,
  onExportDrawing,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  if (!isOpen) return null;

  const filteredDrawings = drawings.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRename = (d: DrawingMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(d.id);
    setEditTitle(d.title);
  };

  const submitRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameDrawing(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div className="relative w-80 md:w-96 bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-gray-800">My Drawings</h2>
            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">
              {drawings.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Search */}
        <div className="p-3 border-b border-gray-100 flex flex-col gap-2">
          <button
            onClick={() => {
              onNewDrawing();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Drawing
          </button>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search drawings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Drawings List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredDrawings.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              {searchQuery ? "No matching drawings found." : "No drawings yet."}
            </div>
          ) : (
            filteredDrawings.map((d) => {
              const isActive = d.id === activeId;
              const isEditing = editingId === d.id;

              return (
                <div
                  key={d.id}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectDrawing(d.id);
                      onClose();
                    }
                  }}
                  className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-50/70 border-indigo-400 shadow-xs"
                      : "bg-white border-gray-200 hover:border-indigo-200 hover:bg-gray-50/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Title or Inline Edit */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => submitRename(d.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename(d.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          className="w-full text-sm font-semibold text-gray-900 border border-indigo-500 rounded px-1.5 py-0.5 outline-none"
                        />
                      ) : (
                        <h3
                          className={`text-sm font-semibold truncate ${
                            isActive ? "text-indigo-950" : "text-gray-800"
                          }`}
                        >
                          {d.title}
                        </h3>
                      )}

                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatTime(d.updated_at)}
                        </span>
                        {d.size && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {formatSize(d.size)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active badge */}
                    {isActive && (
                      <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 bg-indigo-100 rounded-md">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Actions (visible on hover) */}
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRename(d, e)}
                      title="Rename"
                      className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateDrawing(d.id);
                      }}
                      title="Duplicate"
                      className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportDrawing(d.id);
                      }}
                      title="Export .excalidraw"
                      className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-white rounded"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {drawings.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${d.title}"?`)) {
                            onDeleteDrawing(d.id);
                          }
                        }}
                        title="Delete"
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-white rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
