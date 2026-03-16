import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("src/openapi.json");
const destinationPath = resolve("dist/openapi.json");

mkdirSync(dirname(destinationPath), { recursive: true });
copyFileSync(sourcePath, destinationPath);
