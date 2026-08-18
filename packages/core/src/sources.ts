import { payloadString, type QdrantClient } from "./qdrant.js";

export interface SourceDocument {
  sourcePath: string;
  fileName: string;
  title: string;
  content: string;
}

export async function getSourceDocument(
  qdrant: QdrantClient,
  collectionName: string,
  sourcePath: string
): Promise<SourceDocument | undefined> {
  const filter = {
    must: [{ key: "source_path", match: { value: sourcePath } }],
  };

  const chunks: Array<{ chunkIndex: number; content: string }> = [];
  let fileName = "";
  let title = "";
  let offset: unknown;

  do {
    const page = await qdrant.scrollPayloads(collectionName, 256, offset, filter);
    for (const payload of page.payloads) {
      const content = payloadString(payload, "content");
      const chunkIndex = Number(payload["chunk_index"] ?? 0);
      chunks.push({ chunkIndex, content });
      fileName = fileName || payloadString(payload, "file_name");
      title = title || payloadString(payload, "title");
    }
    offset = page.nextOffset;
  } while (offset !== undefined && offset !== null);

  if (!chunks.length) {
    return undefined;
  }

  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  return {
    sourcePath,
    fileName,
    title,
    content: chunks.map((chunk) => chunk.content).join("\n\n"),
  };
}
