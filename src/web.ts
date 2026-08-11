import { spawn } from "node:child_process";
import path from "node:path";
import type { Config } from "./config/config.js";
import { checkServersRunning } from "./checks/serversRunningCheck.js";
import { checkModelsInstalled } from "./checks/modelsInstalledCheck.js";
import { getDb } from "./db/db.js";
import { note } from "./ui.js";

export async function runWeb(
  config: Config,
  port: number,
  prod: boolean,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
  await checkServersRunning(
    config.setup.qdrant.baseUrl,
    config.setup.qdrant.grpcPort,
    config.setup.ollama.baseUrl,
    config.setup.managedViaDocker,
    input,
    output
  );

  await checkModelsInstalled(
    config.setup.ollama.baseUrl,
    [config.chat.retrievalModel, config.chat.chatModel],
    input,
    output
  );

  getDb();

  const repoRoot = process.cwd();
  const webDir = path.join(repoRoot, "web");
  const configPath = path.resolve(repoRoot, "config.json");
  const dbPath = process.env.KH_DB_PATH ?? path.resolve(repoRoot, ".knowledge-hub", "chat.db");

  const env = {
    ...process.env,
    KH_CONFIG_PATH: configPath,
    KH_DB_PATH: dbPath
  };

  const args = prod ? ["run", "start", "--", "-p", String(port)] : ["run", "dev", "--", "-p", String(port)];
  const url = `http://localhost:${port}`;

  note(output, `Starting web UI at ${url}`);
  if (prod) {
    note(output, "Using production build — run `npm run web:build` first if you haven't.");
  }

  const child = spawn("npm", args, {
    cwd: webDir,
    env,
    stdio: "inherit"
  });

  openBrowser(url);

  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`web server exited with code ${code}`));
      } else {
        resolve();
      }
    });
    child.on("error", reject);
  });
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true, shell: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    // best-effort only — the terminal output already shows the URL
  }
}
