import { spawn } from "node:child_process";
import { chdir } from "node:process";

const explicitArgs = process.argv.slice(2);
const hostTarget = {
  darwin: "macos",
  win32: "windows",
  linux: "linux"
}[process.platform];

const args = explicitArgs.length > 0
  ? ["build", ...explicitArgs]
  : hostTarget
    ? ["build", hostTarget, "--debug"]
    : ["build", "web"];

chdir("flutter_ui");

const child = spawn("flutter", args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
