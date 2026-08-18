import { error } from "../ui.js";
import {
  type Config,
  loadConfig as loadCoreConfig,
  writeConfigFile,
  getConfigFilePath
} from "@knowledge-hub/core";

export type { Config } from "@knowledge-hub/core";

export async function loadConfig(output: NodeJS.WritableStream): Promise<Config> {
  try {
    return await loadCoreConfig();
  } catch (errorValue) {
    error(output, (errorValue as Error).message);
    process.exit(1);
  }
}

export { writeConfigFile, getConfigFilePath, loadCoreConfig};
