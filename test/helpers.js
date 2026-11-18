import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixture(name) {
  return fs.readFileSync(path.join(dir, name), "utf8");
}
