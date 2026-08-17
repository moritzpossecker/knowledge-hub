import { QdrantClient } from "../../../dist/src/qdrant.js";
import { getConfig } from "./config";
import type { Config } from "../../../dist/src/config/config.js";

let client: QdrantClient | undefined;

export async function getQdrantClient(): Promise<{ qdrant: QdrantClient; config: Config }> {
  const config = await getConfig();
  if (!client) {
    client = new QdrantClient(config);
  }
  return { qdrant: client, config };
}
