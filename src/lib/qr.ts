// Turns text into a QR code drawing: SVG markup, or paths a canvas can fill.
import { encode } from "uqr";

import { UserError } from "./errors";

export type ErrorCorrection = "L" | "M" | "Q" | "H";
export type DotStyle = "square" | "rounded" | "dots";
export type CornerStyle = "square" | "rounded" | "circle";

export interface QrDesign {
  foreground: string;
  background: string;
  dots: DotStyle;
  corners: CornerStyle;
  errorCorrection: ErrorCorrection;
  /** Quiet zone around the code, in modules. */
  margin: number;
  /** Data URL of a logo for the middle of the code. */
  logo?: string;
  caption?: string;
  subcaption?: string;
}

export interface QrMatrix {
  size: number;
  dark: boolean[][];
  errorCorrection: ErrorCorrection;
}

/** Encodes text (as UTF-8) into a grid of dark and light modules. */
export const makeMatrix = (text: string, errorCorrection: ErrorCorrection): QrMatrix => {
  let result: ReturnType<typeof encode>;
  try {
    result = encode(text, { ecc: errorCorrection, border: 0, boostEcc: false });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new UserError(
        "That's too much to fit in a QR code. Shorten it, or lower the error correction.",
      );
    }
    throw error;
  }
  return { size: result.size, dark: result.data, errorCorrection };
};

/** Whether a module belongs to one of the three large corner squares. */
export const isFinder = (size: number, row: number, col: number) =>
  (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);

/** The share of the code's width a logo may cover. */
export const LOGO_SHARE = 0.22;

/** The modules a logo covers, as [first, last] rows and columns. */
export const logoArea = (size: number) => {
  // odd sizes stay centred on whole modules
  let span = Math.round(size * LOGO_SHARE);
  if (span % 2 !== size % 2) span += 1;
  const first = (size - span) / 2;
  return { first, last: first + span - 1, span };
};

const n = (value: number) => Number(value.toFixed(3)).toString();

/** A rectangle with each corner either square or rounded (r = 0). */
const roundedRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  [tl, tr, br, bl]: number[],
  clockwise = true,
) => {
  if (!clockwise) {
    // the same outline drawn the other way, for holes
    return [
      `M${n(x + tl)} ${n(y)}`,
      tl ? `A${n(tl)} ${n(tl)} 0 0 0 ${n(x)} ${n(y + tl)}` : "",
      `L${n(x)} ${n(y + h - bl)}`,
      bl ? `A${n(bl)} ${n(bl)} 0 0 0 ${n(x + bl)} ${n(y + h)}` : "",
      `L${n(x + w - br)} ${n(y + h)}`,
      br ? `A${n(br)} ${n(br)} 0 0 0 ${n(x + w)} ${n(y + h - br)}` : "",
      `L${n(x + w)} ${n(y + tr)}`,
      tr ? `A${n(tr)} ${n(tr)} 0 0 0 ${n(x + w - tr)} ${n(y)}` : "",
      "Z",
    ].join("");
  }
  return [
    `M${n(x + tl)} ${n(y)}`,
    `L${n(x + w - tr)} ${n(y)}`,
    tr ? `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}` : "",
    `L${n(x + w)} ${n(y + h - br)}`,
    br ? `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}` : "",
    `L${n(x + bl)} ${n(y + h)}`,
    bl ? `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}` : "",
    `L${n(x)} ${n(y + tl)}`,
    tl ? `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}` : "",
    "Z",
  ].join("");
};

const circle = (cx: number, cy: number, r: number, clockwise = true) => {
  const sweep = clockwise ? 1 : 0;
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 ${sweep} ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 ${sweep} ${n(cx - r)} ${n(cy)}Z`;
};

/** One corner square (finder pattern) with its top-left at x, y. */
const finder = (x: number, y: number, unit: number, style: CornerStyle) => {
  const u = unit;
  if (style === "circle") {
    const c = 3.5 * u;
    return (
      circle(x + c, y + c, 3.5 * u) +
      circle(x + c, y + c, 2.5 * u, false) +
      circle(x + c, y + c, 1.5 * u)
    );
  }
  const [outer, inner, eye] = style === "rounded" ? [2.2 * u, 1.3 * u, 1 * u] : [0, 0, 0];
  return (
    roundedRect(x, y, 7 * u, 7 * u, [outer, outer, outer, outer]) +
    roundedRect(x + u, y + u, 5 * u, 5 * u, [inner, inner, inner, inner], false) +
    roundedRect(x + 2 * u, y + 2 * u, 3 * u, 3 * u, [eye, eye, eye, eye])
  );
};

/**
 * Builds the outline of every dark module as one SVG path, which a canvas can
 * also fill with Path2D. Modules under the logo area are left out.
 */
export const modulePath = (
  matrix: QrMatrix,
  options: {
    unit: number;
    x: number;
    y: number;
    dots: DotStyle;
    corners: CornerStyle;
    logo: boolean;
  },
) => {
  const { size, dark } = matrix;
  const { unit: u, x: left, y: top } = options;
  const hole = options.logo ? logoArea(size) : null;
  const inHole = (row: number, col: number) =>
    !!hole &&
    row >= hole.first &&
    row <= hole.last &&
    col >= hole.first &&
    col <= hole.last;
  const isDark = (row: number, col: number) =>
    row >= 0 &&
    col >= 0 &&
    row < size &&
    col < size &&
    dark[row][col] &&
    !isFinder(size, row, col) &&
    !inHole(row, col);

  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isDark(row, col)) continue;
      const x = left + col * u;
      const y = top + row * u;
      if (options.dots === "dots") {
        parts.push(circle(x + u / 2, y + u / 2, u * 0.45));
      } else if (options.dots === "rounded") {
        const up = isDark(row - 1, col);
        const down = isDark(row + 1, col);
        const before = isDark(row, col - 1);
        const after = isDark(row, col + 1);
        const r = u / 2;
        parts.push(
          roundedRect(x, y, u, u, [
            !up && !before ? r : 0,
            !up && !after ? r : 0,
            !down && !after ? r : 0,
            !down && !before ? r : 0,
          ]),
        );
      } else {
        // join runs of squares, which keeps the path short
        let end = col;
        while (isDark(row, end + 1)) end++;
        parts.push(
          `M${n(x)} ${n(y)}h${n((end - col + 1) * u)}v${n(u)}h${n(-(end - col + 1) * u)}Z`,
        );
        col = end;
      }
    }
  }
  for (const [row, col] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    parts.push(finder(left + col * u, top + row * u, u, options.corners));
  }
  return parts.join("");
};

/** Measures text width in pixels for a font size; used to fit captions. */
export type MeasureText = (text: string, fontSize: number, bold: boolean) => number;

export interface Layout {
  width: number;
  height: number;
  unit: number;
  /** Top-left of the first module. */
  x: number;
  y: number;
  qrSize: number;
  logo?: { x: number; y: number; size: number; padding: number };
  captions: { text: string; x: number; y: number; fontSize: number; bold: boolean }[];
}

/** Works out where everything goes in an image `width` pixels wide. */
export const layout = (
  matrix: QrMatrix,
  design: QrDesign,
  width: number,
  measure?: MeasureText,
): Layout => {
  const modules = matrix.size + design.margin * 2;
  const unit = width / modules;
  const x = design.margin * unit;
  const y = design.margin * unit;
  const qrSize = matrix.size * unit;

  let logo: Layout["logo"];
  if (design.logo) {
    const area = logoArea(matrix.size);
    const padding = unit * 0.6;
    logo = {
      x: x + area.first * unit + padding,
      y: y + area.first * unit + padding,
      size: area.span * unit - padding * 2,
      padding,
    };
  }

  const captions: Layout["captions"] = [];
  let height = width;
  const lines = [
    { text: design.caption?.trim() ?? "", scale: 0.07, bold: true },
    { text: design.subcaption?.trim() ?? "", scale: 0.048, bold: false },
  ].filter((line) => line.text);
  if (lines.length) {
    // start below the code, leaving at least a little space
    let baseline = y + qrSize + Math.max(unit * 2.5, width * 0.03);
    const maxWidth = width * 0.88;
    for (const line of lines) {
      let fontSize = width * line.scale;
      const measured = measure?.(line.text, fontSize, line.bold);
      if (measured && measured > maxWidth) {
        fontSize *= maxWidth / measured;
      }
      baseline += fontSize * 1.15;
      captions.push({
        text: line.text,
        x: width / 2,
        y: baseline,
        fontSize,
        bold: line.bold,
      });
      baseline += fontSize * 0.3;
    }
    height = Math.max(width, Math.ceil(baseline + width * 0.05));
  }
  return { width, height, unit, x, y, qrSize, logo, captions };
};

export const CAPTION_FONT = `"Inter Variable", "Inter", "Segoe UI", Roboto, Arial, sans-serif`;

const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The QR code as a stand-alone SVG file. */
export const toSvg = (
  matrix: QrMatrix,
  design: QrDesign,
  width: number,
  measure?: MeasureText,
) => {
  const box = layout(matrix, design, width, measure);
  const path = modulePath(matrix, {
    unit: box.unit,
    x: box.x,
    y: box.y,
    dots: design.dots,
    corners: design.corners,
    logo: !!box.logo,
  });
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box.width)}" height="${n(box.height)}" viewBox="0 0 ${n(box.width)} ${n(box.height)}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(design.background)}"/>`,
    `<path fill="${escapeXml(design.foreground)}" d="${path}"/>`,
  ];
  if (box.logo && design.logo) {
    const { x, y, size, padding } = box.logo;
    parts.push(
      `<rect x="${n(x - padding)}" y="${n(y - padding)}" width="${n(size + padding * 2)}" height="${n(size + padding * 2)}" rx="${n(padding)}" fill="${escapeXml(design.background)}"/>`,
      `<image x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(design.logo)}"/>`,
    );
  }
  for (const caption of box.captions) {
    parts.push(
      `<text x="${n(caption.x)}" y="${n(caption.y)}" text-anchor="middle" font-family="${escapeXml(CAPTION_FONT)}" font-size="${n(caption.fontSize)}" font-weight="${caption.bold ? 700 : 400}" fill="${escapeXml(design.foreground)}">${escapeXml(caption.text)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
};

// Colour contrast

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of a #rrggbb colour, from 0 (black) to 1 (white). */
export const luminance = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return 0;
  }
  const value = parseInt(match[1], 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
};

/** WCAG contrast ratio between two colours, from 1 to 21. */
export const contrastRatio = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** A warning about colours that scanners may struggle with, or "". */
export const colourWarning = (foreground: string, background: string) => {
  const ratio = contrastRatio(foreground, background);
  if (ratio < 3) {
    return `The colours are too similar (contrast ${ratio.toFixed(1)}:1), so most phones won't be able to scan the code. Use a dark colour on a light background.`;
  }
  if (luminance(foreground) > luminance(background)) {
    return "Light codes on a dark background don't work with some scanner apps. A dark code on a light background is safest.";
  }
  if (ratio < 4.5) {
    return `The contrast is low (${ratio.toFixed(1)}:1). Some phones may struggle to scan the code; a darker code colour helps.`;
  }
  return "";
};
