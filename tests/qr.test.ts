import { describe, expect, it } from "vitest";

import { UserError } from "../src/lib/errors";
import {
  colourWarning,
  contrastRatio,
  isFinder,
  layout,
  logoArea,
  luminance,
  makeMatrix,
  modulePath,
  toSvg,
  type QrDesign,
} from "../src/lib/qr";

const design: QrDesign = {
  foreground: "#000000",
  background: "#ffffff",
  dots: "square",
  corners: "square",
  errorCorrection: "M",
  margin: 4,
};

describe("matrix", () => {
  it("encodes text at the chosen error correction", () => {
    const small = makeMatrix("hello", "L");
    expect(small.size).toBe(21);
    expect(small.dark).toHaveLength(21);
    // the top-left finder pattern
    expect(small.dark[0].slice(0, 7)).toEqual(Array(7).fill(true));
    expect(small.dark[1].slice(0, 7)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(makeMatrix("x".repeat(100), "H").size).toBeGreaterThan(
      makeMatrix("x".repeat(100), "L").size,
    );
  });

  it("explains when the text is too long", () => {
    expect(() => makeMatrix("x".repeat(5000), "H")).toThrow(UserError);
  });

  it("finds the corner squares", () => {
    expect(isFinder(21, 0, 0)).toBe(true);
    expect(isFinder(21, 6, 20)).toBe(true);
    expect(isFinder(21, 20, 6)).toBe(true);
    expect(isFinder(21, 20, 20)).toBe(false);
    expect(isFinder(21, 7, 7)).toBe(false);
  });

  it("keeps the logo area centred and small", () => {
    for (const size of [21, 25, 33, 57, 177]) {
      const area = logoArea(size);
      expect(area.first + area.last).toBe(size - 1);
      expect(area.span / size).toBeLessThan(0.3);
    }
  });
});

describe("drawing", () => {
  const matrix = makeMatrix("https://solvey.in", "M");

  it("draws every style", () => {
    for (const dots of ["square", "rounded", "dots"] as const) {
      for (const corners of ["square", "rounded", "circle"] as const) {
        const path = modulePath(matrix, {
          unit: 10,
          x: 40,
          y: 40,
          dots,
          corners,
          logo: false,
        });
        expect(path).toMatch(/^M[\d.]+ [\d.]+/);
        expect(path).not.toContain("NaN");
      }
    }
  });

  it("leaves a hole for the logo", () => {
    const options = { unit: 1, x: 0, y: 0, dots: "dots", corners: "square" } as const;
    const full = modulePath(matrix, { ...options, logo: false });
    const holed = modulePath(matrix, { ...options, logo: true });
    expect(holed.length).toBeLessThan(full.length);
  });

  it("adds space for captions", () => {
    const plain = layout(matrix, design, 1000);
    expect(plain).toMatchObject({ width: 1000, height: 1000, captions: [] });
    expect(plain.unit * (matrix.size + 8)).toBeCloseTo(1000);
    const withCaption = layout(
      matrix,
      { ...design, caption: "Shop", subcaption: "Pay" },
      1000,
    );
    expect(withCaption.height).toBeGreaterThan(1000);
    expect(withCaption.captions.map((c) => c.text)).toEqual(["Shop", "Pay"]);
    // long captions shrink to fit
    const long = layout(matrix, { ...design, caption: "A long name" }, 1000, () => 2000);
    expect(long.captions[0].fontSize).toBeLessThan(withCaption.captions[0].fontSize);
  });

  it("writes a valid SVG with escaped text", () => {
    const svg = toSvg(
      matrix,
      { ...design, caption: `<Tom & "Jerry's">`, logo: "data:image/png;base64,AAAA" },
      512,
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="512"')).toBe(
      true,
    );
    expect(svg).toContain("&#60;Tom &#38; &#34;Jerry&#39;s&#34;&#62;");
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });
});

describe("colours", () => {
  it("measures contrast", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBe(0);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1);
  });

  it("warns about hard-to-scan colours", () => {
    expect(colourWarning("#000000", "#ffffff")).toBe("");
    expect(colourWarning("#1a237e", "#fff8e1")).toBe("");
    expect(colourWarning("#cccccc", "#ffffff")).toMatch(/too similar/);
    expect(colourWarning("#ffffff", "#000000")).toMatch(/dark background/);
    expect(colourWarning("#808080", "#ffffff")).toMatch(/contrast is low/);
  });
});
