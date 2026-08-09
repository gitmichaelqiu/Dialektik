import { copyFile, mkdir } from "node:fs/promises";

await mkdir("frontend/public", { recursive: true });
await copyFile("flutter_ui/assets/engine.js", "frontend/public/engine.js");
