import { execFileSync, spawn } from "node:child_process";
import { chdir } from "node:process";

const explicitArgs = process.argv.slice(2);
const hostDevice = {
  darwin: "macos",
  win32: "windows",
  linux: "linux"
}[process.platform];

function resolveDeviceAlias(alias) {
  if (alias === "web") return "chrome";
  if (alias !== "ios") return alias;

  try {
    const output = execFileSync("flutter", ["devices", "--machine"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const devices = JSON.parse(output);
    const iosDevice = devices.find((device) => {
      return device.targetPlatform === "ios" || device.platform === "ios";
    });
    return iosDevice?.id ?? alias;
  } catch {
    return alias;
  }
}

function normalizeArgs(args) {
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous === "-d" || previous === "--device-id") {
      return resolveDeviceAlias(arg);
    }
    if (arg === "-dweb") return "-dchrome";
    return arg;
  });
}

const normalizedArgs = normalizeArgs(explicitArgs);
const args = normalizedArgs.length > 0
  ? ["run", ...normalizedArgs]
  : hostDevice
    ? ["run", "-d", hostDevice]
    : ["run"];

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
