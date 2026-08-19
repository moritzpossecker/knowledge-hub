import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Config {
  sync: {
    markdownRootPath: string;
    collectionName: string;
    embedBatchSize: number;
    qdrantBatchSize: number;
    uploadParallel: number;
    embedModel: string;
  };
  setup: {
    managedViaDocker: boolean;
    qdrant: {
      baseUrl: string;
      grpcPort: number;
      apiKey?: string;
    };
    ollama: {
      baseUrl: string;
    };
  };
  chat: {
    topK: number;
    scoreThreshold: number;
    systemPrompt: string;
    chatModel: string;
  };
}

function getConfigDir(): string {
  const envConfig = process.env.KH_CONFIG_DIR;
  if (envConfig) {
    return envConfig;
  }

  const appName = "knowledge-hub";

  // Linux/macOS: XDG_CONFIG_HOME oder ~/.config
  if (process.platform !== "win32") {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) {
      return path.join(xdgConfig, appName);
    }
    return path.join(os.homedir(), ".config", appName);
  }

  // Windows: %APPDATA% oder %LOCALAPPDATA%
  const appData = process.env.APPDATA;
  if (appData) {
    return path.join(appData, appName);
  }
  return path.join(os.homedir(), "AppData", "Local", appName);
}

export function getConfigFilePath(): string {
  return path.join(getConfigDir(), "config.json");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readConfigFile(filePath: string): Promise<Config | undefined> {
  if (!(await exists(filePath))) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    throw new Error(`invalid JSON in ${filePath}: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid configuration in ${filePath}: expected a JSON object`);
  }

  const config = parsed as Config;

  config.setup.qdrant.baseUrl = config.setup.qdrant.baseUrl.replace(/\/+$/, "");
  config.setup.ollama.baseUrl = config.setup.ollama.baseUrl.replace(/\/+$/, "");

  return config;
}

export async function loadConfig(): Promise<Config> {
  const config = await readConfigFile(getConfigFilePath());
  if (!config) {
    throw new Error("Configuration file not found. Please run 'knowledge-hub config'.\n");
  }
  return config;
}

export async function writeConfigFile(config: Config): Promise<void> {
  const configDir = getConfigDir();

  await mkdir(configDir, { recursive: true });

  await writeFile(getConfigFilePath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
