import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wabtFactory from "wabt";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(root, "wasm", "catalog.wat");
const outputDir = path.join(root, "public", "wasm");
const outputPath = path.join(outputDir, "catalog.wasm");

const source = await readFile(sourcePath, "utf8");
const wabt = await wabtFactory();
const module = wabt.parseWat("catalog.wat", source);

try {
  module.validate();
  const { buffer } = module.toBinary({ write_debug_names: false });
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, buffer);
  console.log(
    `Built public/wasm/catalog.wasm (${(buffer.byteLength / 1024).toFixed(1)} KB)`,
  );
} finally {
  module.destroy();
}
