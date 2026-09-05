// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
fn get_default_drawings_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = app_handle
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("ExcalidrawDrawings");

    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_drawing_file(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    if let Some(parent) = file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(file_path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn read_drawing_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn list_local_drawing_files(dir: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let file_path = entry.path();
        if file_path.is_file() {
            if let Some(ext) = file_path.extension() {
                if ext == "excalidraw" || ext == "json" {
                    files.push(file_path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(files)
}

fn main() {
    // Fix WebKitGTK DMA-BUF / Wayland hardware acceleration blank window on Linux
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_default_drawings_dir,
            save_drawing_file,
            read_drawing_file,
            list_local_drawing_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
