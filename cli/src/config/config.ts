import { error } from "../ui.js";
import {
  expandPath,
  loadConfig as loadCoreConfig,
  readConfigFile as readCoreConfigFile,
  type Config,
  writeConfigFile,
} from "@knowledge-hub/core";

export type { Config } from "@knowledge-hub/core";

export async function readConfigFile(filePath: string): Promise<Config | undefined> {
  return readCoreConfigFile(filePath);
}

export async function loadConfig(output: NodeJS.WritableStream, filePath: string = "config.json"): Promise<Config> {
  try {
    return await loadCoreConfig(filePath);
  } catch (errorValue) {
    error(output, (errorValue as Error).message);
    process.exit(1);
  }
}

export { expandPath, writeConfigFile };
