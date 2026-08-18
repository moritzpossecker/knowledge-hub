import { getConfig, type Config } from "./config";
import { QdrantClient } from "@knowledge-hub/core";

export { payloadString, type QdrantPoint } from "@knowledge-hub/core";

let client: QdrantClient | undefined;

export async function getQdrantClient(): Promise<{ qdrant: QdrantClient; config: Config }> {
  const config = await getConfig();
  if (!client) {
    client = new QdrantClient(config);
  }
  return { qdrant: client, config };
}
