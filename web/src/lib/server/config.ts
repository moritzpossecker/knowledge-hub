import {
  loadConfig as loadCoreConfig,
  type Config,
} from "@knowledge-hub/core";

export type { Config } from "@knowledge-hub/core";

function resolveDockerNetworkUrl(urlStr: string): string {
  const url = new URL(urlStr);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

export async function loadConfig(): Promise<Config> {
  const config = await loadCoreConfig();

  if (process.env.NODE_ENV !== "development") {
    config.setup.qdrant.baseUrl = resolveDockerNetworkUrl(
      config.setup.qdrant.baseUrl,
    );

    config.setup.ollama.baseUrl = resolveDockerNetworkUrl(
      config.setup.ollama.baseUrl,
    );
  }

  return config;
}

let cached: Config | undefined;

export async function getConfig(): Promise<Config> {
  if (cached) {
    return cached;
  }

  cached = await loadConfig();
  return cached;
}
