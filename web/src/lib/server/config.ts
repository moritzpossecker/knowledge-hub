import {
  loadConfig as loadCoreConfig,
  type Config,
} from "@knowledge-hub/core";

export type { Config } from "@knowledge-hub/core";

export async function loadConfig(): Promise<Config> {
  return loadCoreConfig();
}

let cached: Config | undefined;

export async function getConfig(): Promise<Config> {
  if (cached) {
    return cached;
  }

  cached = await loadConfig();
  return cached;
}
