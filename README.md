# Excalidraw Desktop (Tauri / Rust) + Sincronización Cloudflare (D1 & R2)

Aplicación de escritorio multiplataforma rápida y ligera basada en **Excalidraw**, compilada con **Tauri (Rust)** y sincronización en la nube serverless con **Cloudflare D1 y R2**.

---

## 🌟 Características

- 🎨 **Excalidraw completo:** Dibujo libre, flechas inteligentes, formas geométricas, texto, e imágenes incrustadas.
- ⚡ **Rendimiento Nativo en Rust:** Bajo consumo de memoria (~20 MB vs 300+ MB de Electron).
- 📁 **Gestor de Múltiples Dibujos:** Panel lateral para cambiar de dibujo en 1 clic, crear nuevos, renombrar, duplicar, buscar y exportar archivos `.excalidraw`.
- ☁️ **Sincronización Automática con Cloudflare:**
  - **D1 (Base de datos SQL):** Guarda el estado vectorial, títulos, fechas y versiones.
  - **R2 (Almacenamiento de objetos):** Manejo de imágenes y recursos pesados.
  - **Offline-First:** Guarda al instante de forma local (IndexedDB) y sincroniza en segundo plano con la nube.

---

## 🖥️ Guía de Instalación y Uso en Windows

Sigue estos pasos en tu computadora con Windows para compilar y ejecutar la aplicación:

### Requisitos Previos en Windows
1. **Node.js (LTS):** Descárgalo e instálalo desde [nodejs.org](https://nodejs.org/).
2. **Rust y Cargo:** Descarga y ejecuta el instalador `rustup-init.exe` desde [rustup.rs](https://rustup.rs/).
3. **C++ Build Tools:** Al instalar Rust, te pedirá instalar **Visual Studio C++ Build Tools** (selecciona la opción *"Desarrollo para el escritorio con C++"*).
   > *Nota: Windows 10 y 11 ya incluyen `WebView2` preinstalado de fábrica.*

---

### Pasos para compilar en Windows

1. **Clona este repositorio:**
   ```powershell
   git clone https://github.com/Yoyiberto/excalidraw-desktop-sync.git
   cd excalidraw-desktop-sync
   ```

2. **Instala las dependencias y corre en modo desarrollo:**
   ```powershell
   cd app
   npm install
   npm run tauri dev
   ```

3. **Generar el Instalador Nativo `.exe` / `.msi`:**
   ```powershell
   npm run tauri build
   ```
   Una vez terminada la compilación, encontrarás el instalador listo en:
   📁 `app\src-tauri\target\release\bundle\msi\Excalidraw Desktop_1.0.0_x64_en-US.msi` (o en `bundle\nsis\*.exe`).

   Haz doble clic sobre el instalador para instalarlo en Windows.

---

### Opción Alternativa en Windows (Sin instalar Rust / Modo PWA)
Si no deseas instalar Rust ni los compiladores de C++ en Windows:
1. Abre PowerShell en la carpeta `app`:
   ```powershell
   npm install
   npm run dev
   ```
2. Abre `http://localhost:1420` en **Google Chrome** o **Microsoft Edge**.
3. Haz clic en el botón **"Instalar Excalidraw Desktop"** (en la barra de direcciones del navegador).
4. Se creará una ventana independiente de escritorio idéntica a una aplicación nativa.

---

## 🐧 Ejecución en Ubuntu / Linux

```bash
# Dependencias de WebKit en Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev

# Ejecutar en modo desarrollo
cd app
npm install
npm run tauri dev

# Compilar paquete .deb y AppImage
npm run tauri build
```

---

## ☁️ Sincronización en la Nube (Cloudflare Worker)

Tu backend ya se encuentra desplegado y listo en:
🔗 `https://draw-sync-worker.draw-sync-worker.workers.dev`

### Probar o redesplegar el worker (`worker/`):
```bash
cd worker
npm install
npm run test           # Ejecuta suite de pruebas (Vitest)
npm run dev            # Inicia servidor local en http://localhost:8787
npx wrangler deploy    # Publica cambios en Cloudflare
```

---

## ⚙️ Configuración de Sincronización en la App

1. Dentro de la aplicación, haz clic en el ícono de ⚙️ **Configuración** (esquina superior derecha).
2. Verifica que la **URL del Worker** esté configurada (`https://draw-sync-worker.draw-sync-worker.workers.dev`).
3. Haz clic en **"Test Connection"** y luego en **"Save Configuration"**.
4. ¡Tus dibujos se sincronizarán en tiempo real entre Ubuntu y Windows!
