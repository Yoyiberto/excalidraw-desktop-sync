// Cross-platform `tauri` launcher. On Linux the dev watcher needs a higher
// open-files limit (ulimit), which is shell syntax that breaks npm on Windows.
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const child =
  process.platform === "linux"
    ? spawn("sh", ["-c", 'ulimit -n 65535 2>/dev/null; exec tauri "$@"', "tauri", ...args], { stdio: "inherit" })
    : spawn("tauri", args, { stdio: "inherit", shell: process.platform === "win32" });

child.on("exit", (code) => process.exit(code ?? 1));
