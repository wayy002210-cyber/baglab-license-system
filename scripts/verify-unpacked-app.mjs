import { spawn } from "node:child_process";
import { join } from "node:path";

const executable = join(
  process.cwd(),
  "release",
  "win-unpacked",
  "全自动混剪工作台.exe"
);
const child = spawn(executable, [], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
const outcome = await Promise.race([
  new Promise((resolve) =>
    child.once("exit", (code) => resolve({ exited: true, code }))
  ),
  new Promise((resolve) =>
    setTimeout(() => resolve({ exited: false }), 10_000)
  )
]);
if (outcome.exited) {
  throw new Error(`Packaged app exited early (${outcome.code}): ${stderr}`);
}
if (child.pid) {
  spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
    windowsHide: true,
    stdio: "ignore"
  });
}
process.stdout.write("Packaged desktop app remained healthy for 10 seconds\n");
