import { Config } from "../config/config.js";
import { payloadString, QdrantClient } from "../qdrant.js";
import {
  note,
  panel,
  style,
  subheading,
} from "../ui.js";
import { checkServersRunning } from "./serversRunningCheck.js";

const green = "\x1b[32m";
const yellow = "\x1b[33m";

export async function runCollectionCheck(
  config: Config,
  samples: number,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {

  await checkServersRunning(
    config.setup.qdrant.baseUrl,
    config.setup.qdrant.grpcPort,
    config.setup.ollama.baseUrl,
    config.setup.managedViaDocker,
    input,
    output
  );
    
  const qdrant = new QdrantClient(config);

  const info = await qdrant.collectionInfo(
    config.sync.collectionName,
  );

  const status =
    info.status === "green"
      ? style(output, green, String(info.status))
      : style(output, yellow, String(info.status));

  panel(output, "Qdrant collection", [
    ["Name", config.sync.collectionName],
    ["Status", status],
    ["Points", String(info.pointsCount)],
  ]);

  if (samples <= 0) {
    return;
  }

  const sample = await qdrant.scrollPayloads(
    config.sync.collectionName,
    samples,
  );

  if (sample.payloads.length === 0) {
    note(output, "No payloads found.");
    return;
  }

  subheading(
    output,
    "Sample payloads",
  );

  sample.payloads.forEach((payload, index) => {
    const content = payloadString(payload, "content")
      .replaceAll("\n", " ")
      .trim();

    const preview =
      content.length > 240
        ? `${content.slice(0, 240)}…`
        : content;

    panel(output, `Point ${index + 1}`, [
      ["Source", payloadString(payload, "source_path")],
      ["Heading", payloadString(payload, "heading_path")],
      ["Content", preview],
    ]);
  });
}