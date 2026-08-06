import { createReadStream } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

export interface Config {
  markdownRoot: string;
  collectionName: string;
  qdrantBaseUrl: string;
  qdrantGrpcPort: number;
  qdrantApiKey: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEmbedModel: string;
  ollamaChatModel: string;
  embedBatchSize: number;
  qdrantBatchSize: number;
  uploadParallel: number;
  deleteMissingFiles: boolean;
  recreateCollection: boolean;
  payloadIndexFields: string[];
  chatTopK: number;
  chatScoreThreshold?: number;
  chatScoreThresholdRaw: string;
  chatSystemPrompt: string;
}

export const defaults: Record<string, string> = {
  MARKDOWN_ROOT: "./docs",
  COLLECTION_NAME: "markdown_docs",
  QDRANT_BASE_URL: "http://localhost:6333",
  QDRANT_GRPC_PORT: "6334",
  QDRANT_API_KEY: "",
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "embeddinggemma",
  OLLAMA_EMBED_MODEL: "embeddinggemma",
  OLLAMA_CHAT_MODEL: "llama3.1",
  EMBED_BATCH_SIZE: "32",
  QDRANT_BATCH_SIZE: "128",
  UPLOAD_PARALLEL: "2",
  DELETE_MISSING_FILES: "false",
  RECREATE_COLLECTION: "false",
  PAYLOAD_INDEX_FIELDS: "document_id,source_path,file_name",
  CHAT_TOP_K: "5",
  CHAT_SCORE_THRESHOLD: "",
  CHAT_SYSTEM_PROMPT:
    "You are a documentation assistant. Answer only from the provided context. If the answer is not in the context, say clearly that you could not find it in the indexed docs. When useful, cite source paths from the context."
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  if (!(await exists(filePath))) {
    return {};
  }

  const values: Record<string, string> = {};
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function envValue(values: Record<string, string>, key: string): string {
  return process.env[key] ?? values[key] ?? defaults[key] ?? "";
}

function intValue(values: Record<string, string>, key: string): number {
  const raw = envValue(values, key);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid ${key}: ${raw}`);
  }
  return parsed;
}

function boolValue(values: Record<string, string>, key: string): boolean {
  const raw = envValue(values, key).trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function expandPath(value: string): string {
  if (!value) {
    return value;
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.resolve(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

export async function loadConfig(filePath = ".env"): Promise<Config> {
  const values = await readEnvFile(filePath);
  const chatScoreThresholdRaw = envValue(values, "CHAT_SCORE_THRESHOLD").trim();
  let chatScoreThreshold: number | undefined;
  if (chatScoreThresholdRaw) {
    chatScoreThreshold = Number.parseFloat(chatScoreThresholdRaw);
    if (!Number.isFinite(chatScoreThreshold)) {
      throw new Error(`invalid CHAT_SCORE_THRESHOLD: ${chatScoreThresholdRaw}`);
    }
  }

  const ollamaModel = envValue(values, "OLLAMA_MODEL");
  return {
    markdownRoot: expandPath(envValue(values, "MARKDOWN_ROOT")),
    collectionName: envValue(values, "COLLECTION_NAME"),
    qdrantBaseUrl: envValue(values, "QDRANT_BASE_URL").replace(/\/+$/, ""),
    qdrantGrpcPort: intValue(values, "QDRANT_GRPC_PORT"),
    qdrantApiKey: envValue(values, "QDRANT_API_KEY"),
    ollamaBaseUrl: envValue(values, "OLLAMA_BASE_URL").replace(/\/+$/, ""),
    ollamaModel,
    ollamaEmbedModel: envValue(values, "OLLAMA_EMBED_MODEL") || ollamaModel,
    ollamaChatModel: envValue(values, "OLLAMA_CHAT_MODEL") || ollamaModel,
    embedBatchSize: intValue(values, "EMBED_BATCH_SIZE"),
    qdrantBatchSize: intValue(values, "QDRANT_BATCH_SIZE"),
    uploadParallel: intValue(values, "UPLOAD_PARALLEL"),
    deleteMissingFiles: boolValue(values, "DELETE_MISSING_FILES"),
    recreateCollection: boolValue(values, "RECREATE_COLLECTION"),
    payloadIndexFields: splitCsv(envValue(values, "PAYLOAD_INDEX_FIELDS")),
    chatTopK: intValue(values, "CHAT_TOP_K"),
    chatScoreThreshold,
    chatScoreThresholdRaw,
    chatSystemPrompt: envValue(values, "CHAT_SYSTEM_PROMPT")
  };
}

export function configToEnvValues(config: Config): Record<string, string> {
  return {
    MARKDOWN_ROOT: config.markdownRoot,
    COLLECTION_NAME: config.collectionName,
    QDRANT_BASE_URL: config.qdrantBaseUrl,
    QDRANT_GRPC_PORT: String(config.qdrantGrpcPort),
    QDRANT_API_KEY: config.qdrantApiKey,
    OLLAMA_BASE_URL: config.ollamaBaseUrl,
    OLLAMA_MODEL: config.ollamaModel,
    OLLAMA_EMBED_MODEL: config.ollamaEmbedModel,
    OLLAMA_CHAT_MODEL: config.ollamaChatModel,
    EMBED_BATCH_SIZE: String(config.embedBatchSize),
    QDRANT_BATCH_SIZE: String(config.qdrantBatchSize),
    UPLOAD_PARALLEL: String(config.uploadParallel),
    DELETE_MISSING_FILES: String(config.deleteMissingFiles),
    RECREATE_COLLECTION: String(config.recreateCollection),
    PAYLOAD_INDEX_FIELDS: config.payloadIndexFields.join(","),
    CHAT_TOP_K: String(config.chatTopK),
    CHAT_SCORE_THRESHOLD: config.chatScoreThresholdRaw,
    CHAT_SYSTEM_PROMPT: config.chatSystemPrompt
  };
}

export async function writeEnvFile(filePath: string, values: Record<string, string>): Promise<void> {
  const keys = Object.keys(values).sort();
  const body = keys.map((key) => `${key}=${values[key] ?? ""}`).join("\n") + "\n";
  await writeFile(filePath, body, "utf8");
}
