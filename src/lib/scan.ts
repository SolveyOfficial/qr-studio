// Finds and reads QR codes in images and camera frames.
import { UserError } from "./errors";
import { loadImage } from "./render";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

let detector: Promise<BarcodeDetectorLike | null> | null = null;

/** The browser's own QR reader, where there is one. */
const nativeDetector = () =>
  (detector ??= (async () => {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass })
      .BarcodeDetector;
    try {
      if (Detector && (await Detector.getSupportedFormats()).includes("qr_code")) {
        return new Detector({ formats: ["qr_code"] });
      }
    } catch {
      // fall back to the bundled reader
    }
    return null;
  })());

let zxing: Promise<typeof import("zxing-wasm/reader")> | null = null;

/** The bundled ZXing reader, with its WebAssembly file served by this site. */
const zxingReader = () =>
  (zxing ??= import("zxing-wasm/reader").then((module) => {
    module.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm")
            ? `${import.meta.env.BASE_URL}zxing/${path}`
            : prefix + path,
      },
    });
    return module;
  }));

/** Starts loading the readers, so the first scan is quick. */
export const prepareScanner = () => {
  void nativeDetector();
  void zxingReader();
};

/** Returns the text of the QR code in the image, or null if none is found. */
export const decodeImageData = async (image: ImageData): Promise<string | null> => {
  const native = await nativeDetector();
  if (native) {
    try {
      const [code] = await native.detect(image);
      if (code?.rawValue) {
        return code.rawValue;
      }
    } catch {
      // try the bundled reader instead
    }
  }
  const { readBarcodes } = await zxingReader();
  const results = await readBarcodes(image, {
    formats: ["QRCode", "MicroQRCode"],
    tryHarder: true,
    tryInvert: true,
    maxNumberOfSymbols: 1,
  });
  const found = results.find((result) => result.isValid);
  return found ? found.text : null;
};

/** Copies a picture (or video frame) into pixels, at most `max` pixels wide or high. */
export const pixels = (
  source: CanvasImageSource,
  width: number,
  height: number,
  max = 2048,
  canvas = document.createElement("canvas"),
) => {
  const scale = Math.min(1, max / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  // transparent images (like many PNG codes) are read on white
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

/** Reads the QR code in an image file (PNG, JPG, WebP, GIF or SVG). */
export const decodeFile = async (file: Blob) => {
  const url = URL.createObjectURL(file);
  try {
    let image: HTMLImageElement;
    try {
      image = await loadImage(url);
    } catch {
      throw new UserError("This file can't be opened as an image.");
    }
    const width = image.naturalWidth || 1024;
    const height = image.naturalHeight || 1024;
    let text = await decodeImageData(pixels(image, width, height));
    if (text === null && Math.max(width, height) > 2048) {
      // small codes in large photos may need every pixel
      text = await decodeImageData(pixels(image, width, height, 4096));
    }
    if (text === null) {
      throw new UserError(
        "No QR code found in this image. Try a sharper picture with the whole code in view.",
      );
    }
    return text;
  } finally {
    URL.revokeObjectURL(url);
  }
};
