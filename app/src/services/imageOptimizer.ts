// Re-encodes pasted/dropped images before they enter the scene.
// Images are stored as dataURLs inside the drawing (IndexedDB + D1 row), so
// every byte counts: a PNG screenshot is typically 1-3 MB, the same image as
// WebP at WhatsApp-like resolution is ~100-250 KB.

export type ImageQuality = "standard" | "hd" | "original";

interface Preset {
  label: string;
  hint: string;
  maxSide: number;
  quality: number;
}

export const IMAGE_PRESETS: Record<ImageQuality, Preset> = {
  standard: { label: "Standard", hint: "WebP · 1600 px (WhatsApp-like)", maxSide: 1600, quality: 0.8 },
  hd: { label: "HD", hint: "WebP · 2560 px", maxSide: 2560, quality: 0.9 },
  original: { label: "Original", hint: "Untouched file", maxSide: Infinity, quality: 1 },
};

const QUALITY_KEY = "draw_image_quality";

export const getDefaultImageQuality = (): ImageQuality => {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === "standard" || v === "hd" || v === "original") return v;
  } catch {}
  return "standard";
};

export const setDefaultImageQuality = (q: ImageQuality) => {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {}
};

// SVG is vector (nothing to gain) and GIF would lose its animation.
const PASSTHROUGH = new Set(["image/svg+xml", "image/gif"]);

export const isOptimizableImage = (file: File | undefined | null): file is File =>
  !!file && file.type.startsWith("image/") && !PASSTHROUGH.has(file.type);

export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  converted: boolean;
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function optimizeImage(file: File, quality: ImageQuality): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const preset = IMAGE_PRESETS[quality];

  if (quality === "original" || !isOptimizableImage(file)) {
    bitmap.close();
    return { blob: file, width: srcW, height: srcH, originalBytes: file.size, converted: false };
  }

  const scale = Math.min(1, preset.maxSide / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  // Halve in steps first: a single large downscale with drawImage aliases text.
  let source: CanvasImageSource = bitmap;
  let curW = srcW;
  let curH = srcH;
  while (curW / 2 >= dstW && curH / 2 >= dstH) {
    const step = document.createElement("canvas");
    step.width = Math.round(curW / 2);
    step.height = Math.round(curH / 2);
    const sctx = step.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(source, 0, 0, step.width, step.height);
    source = step;
    curW = step.width;
    curH = step.height;
  }

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, dstW, dstH);
  bitmap.close();

  let blob = await canvasToBlob(canvas, "image/webp", preset.quality);
  if (!blob || blob.type !== "image/webp") {
    // Engines without a WebP encoder (older WebKitGTK) — JPEG for photos, PNG keeps alpha.
    const fallback = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    blob = await canvasToBlob(canvas, fallback, preset.quality);
  }

  // Already small and not downscaled: re-encoding would only cost quality.
  if (!blob || (scale === 1 && blob.size >= file.size)) {
    return { blob: file, width: srcW, height: srcH, originalBytes: file.size, converted: false };
  }

  return { blob, width: dstW, height: dstH, originalBytes: file.size, converted: true };
}

export const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
