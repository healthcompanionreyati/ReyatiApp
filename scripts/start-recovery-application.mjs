import { spawn, spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

const stateArg = process.argv.find((value) => value.startsWith("--state="));
const portArg = process.argv.find((value) => value.startsWith("--port="));
const statePath = resolve(stateArg?.slice("--state=".length) ?? "");
const port = Number(portArg?.slice("--port=".length) ?? "3107");
const allowedStateRoot = resolve("work/hosted-recovery");
const stateRelativePath = relative(allowedStateRoot, statePath);

if (
  !stateArg ||
  !isAbsolute(statePath) ||
  stateRelativePath.startsWith("..") ||
  isAbsolute(stateRelativePath) ||
  !/[\\/]\.wrangler[\\/]state$/i.test(statePath)
) {
  throw new Error("Recovery application state must be an isolated work/hosted-recovery/<run>/.wrangler/state path");
}
if (!Number.isSafeInteger(port) || port < 3000 || port > 3999) {
  throw new Error("Recovery application port must be between 3000 and 3999");
}

const env = { ...process.env };
delete env.CLERK_SECRET_KEY;
delete env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
delete env.CLOUDFLARE_ACCOUNT_ID;
delete env.CLOUDFLARE_D1_DATABASE_ID;
delete env.CLOUDFLARE_D1_API_TOKEN;
env.QIVAYA_RECOVERY_D1_STATE_PATH = statePath;
env.QIVAYA_RECOVERY_REHEARSAL_MODE = "1";
env.NEXT_TELEMETRY_DISABLED = "1";
env.WRANGLER_WRITE_LOGS = "false";
env.WRANGLER_LOG_PATH = resolve(statePath, "logs");
env.MINIFLARE_REGISTRY_PATH = resolve(statePath, "registry");
env.WRANGLER_REGISTRY_PATH = resolve(statePath, "registry");

const vinextCli = resolve("node_modules/vinext/dist/cli.js");
const build = spawnSync(process.execPath, [vinextCli, "build"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`Recovery application build failed with exit code ${build.status}`);

const wranglerCli = resolve("node_modules/wrangler/bin/wrangler.js");
const wranglerConfig = resolve("dist/server/wrangler.json");
const child = spawn(process.execPath, [
  wranglerCli,
  "dev",
  "--config", wranglerConfig,
  "--local",
  "--persist-to", statePath,
  "--ip", "127.0.0.1",
  "--port", String(port),
  "--log-level", "warn",
  "--show-interactive-dev-session", "false",
], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
