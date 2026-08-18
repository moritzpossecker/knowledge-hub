import path from "node:path";
import {
  loadConfig as loadCoreConfig,
  readConfigFile as readCoreConfigFile,
  type Config,
} from "@knowledge-hub/core";

export type { Config } from "@knowledge-hub/core";

export async function readConfigFile(filePath: string): Promise<Config | undefined> {
  return readCoreConfigFile(filePath);
}

export async function loadConfig(filePath: string = "config.json"): Promise<Config> {
  return loadCoreConfig(filePath);
}

let cached: Config | undefined;

export async function getConfig(): Promise<Config> {
  if (cached) {
    return cached;
  }
  const configPath = process.env.KH_CONFIG_PATH || path.join(process.cwd(), "../cli/config.json");
  cached = await loadConfig(configPath);
  return cached;
}
