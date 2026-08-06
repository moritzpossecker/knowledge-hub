import { checkModelsInstalled } from "../checks/modelsInstalledCheck.js";
import { checkServersRunning } from "../checks/serversRunningCheck.js";
import type { Config } from "../config/config.js";
import { isGitUrl, cloneRepo } from "./git.js";
import { buildChunks, iterMarkdownFiles, type Chunk } from "./markdown.js";
import { ollamaEmbed } from "../ollama.js";
import { QdrantClient, type QdrantPoint, payloadString } from "../qdrant.js";

export interface SyncStats {
  files: number;
  chunks: number;
}

function progress(out: NodeJS.WritableStream | undefined, message: string): void {
  out?.write(message);
}

export async function runSync(
  config: Config,
  output: NodeJS.WritableStream,
  input: NodeJS.ReadableStream
): Promise<SyncStats> {
  let root = config.sync.markdownRootPath;
  let cleanup: (() => Promise<void>) | undefined;
  if (isGitUrl(root)) {
    const cloned = await cloneRepo(root);
    root = cloned.root;
    cleanup = cloned.cleanup;
  }

  try {
    const files = await iterMarkdownFiles(root);
    if (!files.length) {
      throw new Error(`no markdown files found in ${root}`);
    }

    progress(output, `› Found ${files.length} Markdown files\n`);

    await checkServersRunning(
      config.setup.qdrant.baseUrl,
      config.setup.qdrant.grpcPort,
      config.setup.ollama.baseUrl,
      config.setup.managedViaDocker,
      input,
      output
    )

    await checkModelsInstalled(
      config.setup.ollama.baseUrl,
      [config.sync.embedModel],
      input,
      output
    );

    progress(output, "› Connecting to Qdrant and preparing the collection\n");

    const qdrant = new QdrantClient(config);
    const vectorSize = await inferVectorSize(config);
    // TODO: inject via option --recreate
    await qdrant.ensureCollection(config.sync.collectionName, vectorSize, false);
    progress(output, "✓ Collection ready — starting upload\n\n");

    const existing = new Set<string>();
    let totalChunks = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const rel = file.slice(root.length).replace(/^[/\\]/, "").split("\\").join("/");
      progress(output, `[${fileIndex + 1}/${files.length}]  ${rel}\n`);

      const chunks = await buildChunks(root, file);
      if (!chunks.length) {
        progress(output, "\t↳ skipped (no indexable content)\n");
        continue;
      }

      existing.add(chunks[0].documentId);
      await qdrant.deleteDocumentPoints(config.sync.collectionName, chunks[0].documentId);
      progress(output, `\t↳ embedding and uploading ${chunks.length} chunks\n`);
      await upsertChunks(qdrant, config, chunks, (uploaded, total) => {
        progress(output, `\t↳ uploaded ${uploaded}/${total} chunks\n`);
      });
      totalChunks += chunks.length;
      progress(output, "\t✓ complete\n");
    }

    // TODO: inject via option --prune
    if (false) {
      progress(output, "\n› Removing vectors for missing source files\n");
      await deleteMissingDocuments(qdrant, config, existing);
    }

    return { files: files.length, chunks: totalChunks };
  } finally {
    await cleanup?.();
  }
}

export async function runCollectionCheck(
  config: Config,
  extended: boolean,
  limit: number,
  out: NodeJS.WritableStream
): Promise<void> {
  const qdrant = new QdrantClient(config);
  const info = await qdrant.collectionInfo(config.sync.collectionName);
  out.write("\nCollection summary\n");
  out.write(`  Name    ${config.sync.collectionName}\n`);
  out.write(`  Status  ${info.status}\n`);
  out.write(`  Points  ${info.pointsCount}\n`);

  if (!extended) {
    return;
  }

  const sample = await qdrant.scrollPayloads(config.sync.collectionName, limit);
  sample.payloads.forEach((payload, index) => {
    out.write(`\nSample point ${index + 1}\n`);
    out.write(`  source_path: ${payloadString(payload, "source_path")}\n`);
    out.write(`  heading_path: ${payloadString(payload, "heading_path")}\n`);
    const content = payloadString(payload, "content");
    const preview = content.length > 240 ? `${content.slice(0, 240)}...` : content;
    out.write(`  content: ${preview.replaceAll("\n", " ")}\n`);
  });
}

async function inferVectorSize(config: Config): Promise<number> {
  const embeddings = await ollamaEmbed(config.setup.ollama.baseUrl, config.sync.embedModel, ["vector size probe"]);
  return embeddings[0].length;
}

async function upsertChunks(
  qdrant: QdrantClient,
  config: Config,
  chunks: Chunk[],
  onUploaded?: (uploaded: number, total: number) => void
): Promise<void> {
  const texts = chunks.map((chunk) => chunk.content);
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += config.sync.embedBatchSize) {
    const batch = texts.slice(i, i + config.sync.embedBatchSize);
    vectors.push(...(await ollamaEmbed(config.setup.ollama.baseUrl, config.sync.embedModel, batch)));
  }

  const points: QdrantPoint[] = chunks.map((chunk, index) => ({
    id: chunk.pointId,
    vector: vectors[index],
    payload: {
      document_id: chunk.documentId,
      source_path: chunk.sourcePath,
      file_name: chunk.fileName,
      title: chunk.title,
      headings: chunk.headings,
      heading_path: chunk.headingPath,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_hash: chunk.contentHash,
      file_hash: chunk.fileHash,
      modified_at: chunk.modifiedAt
    }
  }));

  for (let i = 0; i < points.length; i += config.sync.qdrantBatchSize) {
    const end = Math.min(i + config.sync.qdrantBatchSize, points.length);
    await qdrant.upsertPoints(config.sync.collectionName, points.slice(i, end));
    onUploaded?.(end, points.length);
  }
}

async function deleteMissingDocuments(qdrant: QdrantClient, config: Config, existing: Set<string>): Promise<void> {
  let offset: unknown;
  const stale = new Set<string>();

  do {
    const page = await qdrant.scrollPayloads(config.sync.collectionName, 256, offset);
    for (const payload of page.payloads) {
      const documentId = payloadString(payload, "document_id");
      if (documentId && !existing.has(documentId)) {
        stale.add(documentId);
      }
    }
    offset = page.nextOffset;
  } while (offset !== undefined && offset !== null);

  for (const documentId of stale) {
    await qdrant.deleteDocumentPoints(config.sync.collectionName, documentId);
  }
}
