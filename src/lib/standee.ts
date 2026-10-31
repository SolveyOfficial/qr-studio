// A printable sign (standee) with the QR code, as a one-page PDF.
import type { QrDesign, QrMatrix } from "./qr";
import { canvasToBlob, drawQr } from "./render";

export type PaperSize = "A4" | "A6";

/** Page sizes in PDF points (1/72 inch). */
export const PAPER: Record<PaperSize, [number, number]> = {
  A4: [595.28, 841.89],
  A6: [297.64, 419.53],
};

export interface StandeeText {
  title: string;
  subtitle: string;
  /** Lines under the code, the first in bold. */
  footer: string[];
}

const font = (size: number, weight: number) =>
  `${weight} ${size}px "Plus Jakarta Sans Variable", "Inter Variable", Arial, sans-serif`;

/** Draws the sign; A4 and A6 share the same proportions. */
export const drawStandee = async (
  matrix: QrMatrix,
  design: QrDesign,
  text: StandeeText,
) => {
  const width = 1654;
  const height = 2339;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = design.background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = design.foreground;
  context.textAlign = "center";

  const fit = (line: string, size: number, weight: number) => {
    context.font = font(size, weight);
    const measured = context.measureText(line).width;
    const max = width * 0.86;
    if (measured > max) {
      context.font = font((size * max) / measured, weight);
    }
  };

  let y = height * 0.11;
  if (text.title) {
    fit(text.title, 130, 700);
    context.fillText(text.title, width / 2, y);
    y += 90;
  }
  if (text.subtitle) {
    fit(text.subtitle, 72, 500);
    context.fillText(text.subtitle, width / 2, y);
  }

  const size = Math.round(width * 0.72);
  const code = await drawQr(matrix, { ...design, caption: "", subcaption: "" }, size);
  const top = Math.round(height * 0.2);
  context.drawImage(code, (width - size) / 2, top);

  y = top + size + 120;
  text.footer.forEach((line, index) => {
    fit(line, index === 0 ? 78 : 58, index === 0 ? 700 : 500);
    context.fillText(line, width / 2, y);
    y += index === 0 ? 100 : 80;
  });
  return canvas;
};

export const standeePdf = async (canvas: HTMLCanvasElement, paper: PaperSize) => {
  const { PDFDocument } = await import("pdf-lib");
  const png = new Uint8Array(await (await canvasToBlob(canvas)).arrayBuffer());
  const pdf = await PDFDocument.create();
  pdf.setTitle("QR code");
  pdf.setProducer("Solvey QR Studio");
  pdf.setCreator("Solvey QR Studio");
  const [width, height] = PAPER[paper];
  const page = pdf.addPage([width, height]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return pdf.save();
};
