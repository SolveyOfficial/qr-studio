// Draws QR codes on a canvas for PNG files, the clipboard and printing.
import { UserError } from "./errors";
import {
  CAPTION_FONT,
  layout,
  modulePath,
  type MeasureText,
  type QrDesign,
  type QrMatrix,
} from "./qr";

let measureContext: CanvasRenderingContext2D | null = null;

const font = (fontSize: number, bold: boolean) =>
  `${bold ? 700 : 400} ${fontSize}px ${CAPTION_FONT}`;

/** Measures caption text with the page's own font. */
export const measureText: MeasureText = (text, fontSize, bold) => {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) {
    return 0;
  }
  measureContext.font = font(fontSize, bold);
  return measureContext.measureText(text).width;
};

export const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new UserError("This image can't be opened."));
    image.src = url;
  });

/** Draws the code onto a new canvas `width` pixels wide. */
export const drawQr = async (matrix: QrMatrix, design: QrDesign, width: number) => {
  await document.fonts?.ready;
  const box = layout(matrix, design, width, measureText);
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = design.background;
  context.fillRect(0, 0, box.width, box.height);
  context.fillStyle = design.foreground;
  context.fill(
    new Path2D(
      modulePath(matrix, {
        unit: box.unit,
        x: box.x,
        y: box.y,
        dots: design.dots,
        corners: design.corners,
        logo: !!box.logo,
      }),
    ),
  );
  if (box.logo && design.logo) {
    const { x, y, size, padding } = box.logo;
    context.fillStyle = design.background;
    context.beginPath();
    context.roundRect(
      x - padding,
      y - padding,
      size + padding * 2,
      size + padding * 2,
      padding,
    );
    context.fill();
    const image = await loadImage(design.logo);
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    context.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  context.fillStyle = design.foreground;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  for (const caption of box.captions) {
    context.font = font(caption.fontSize, caption.bold);
    context.fillText(caption.text, caption.x, caption.y);
  }
  return canvas;
};

export const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/png") =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save the image."))),
      type,
    ),
  );

/**
 * Reads a logo file, scaled down to at most 512 pixels, as a PNG data URL,
 * so it stays small inside SVG files.
 */
export const readLogo = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new UserError("Choose an image file (PNG, JPG, WebP or SVG) for the logo.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth || 512;
    const height = image.naturalHeight || 512;
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
};
