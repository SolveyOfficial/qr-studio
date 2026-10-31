// Copies the ZXing WebAssembly reader into public/zxing, so the app serves it
// itself instead of loading it from a CDN. Its licence files go with it.
import fs from "node:fs";
import path from "node:path";

const source = path.join("node_modules", "zxing-wasm");
const target = path.join("public", "zxing");

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(
  path.join(source, "dist", "reader", "zxing_reader.wasm"),
  path.join(target, "zxing_reader.wasm"),
);
fs.copyFileSync(
  path.join(source, "LICENSE"),
  path.join(target, "LICENSE-zxing-wasm.txt"),
);
fs.copyFileSync(
  path.join("scripts", "licences", "zxing-cpp-apache-2.0.txt"),
  path.join(target, "LICENSE-zxing-cpp.txt"),
);
console.log(`Copied the ZXing reader to ${target}`);
