import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { error } from "../ui.js";

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
  }
  chat: {
    topK: number;
    scoreThreshold: number;
    systemPrompt: string;
    retrievalModel: string;
    chatModel: string;
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readConfigFile(filePath: string): Promise<Config | undefined> {
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

export async function loadConfig(output: NodeJS.WritableStream, filePath: string = "config.json"): Promise<Config> {
  const config = await readConfigFile(filePath);
    if (!config) {
      error(output, "Configuration file not found. Please run 'knowledge-hub config'.\n");
      process.exit(1);
  }
  return config;
}

export function expandPath(value: string): string {
  if (!value) {
    return value;
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.resolve(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

export async function writeConfigFile(filePath: string, config: Config): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
