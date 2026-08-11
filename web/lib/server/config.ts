import path from "node:path";
import { loadConfig, type Config } from "../../../dist/src/config/config.js";

let cached: Config | undefined;

export async function getConfig(): Promise<Config> {
  if (cached) {
    return cached;
  }
  const configPath = process.env.KH_CONFIG_PATH ?? path.resolve(process.cwd(), "..", "config.json");
  cached = await loadConfig(process.stdout, configPath);
  return cached;
}
