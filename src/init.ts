import { access } from "node:fs/promises";
import readline from "node:readline/promises";
import { configToEnvValues, defaults, loadConfig, writeEnvFile } from "./config.js";
import { runComposeUp } from "./compose.js";
import { isHttpHealthy, isLocalhost, parseQdrantUrl, qdrantGrpcAddress, qdrantHealthUrl, urlPort } from "./http.js";
import { ollamaMissingModels, pullOllamaModel } from "./ollama.js";
import { note, success } from "./ui.js";

export async function runInit(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<void> {
  let values: Record<string, string>;
  try {
    values = configToEnvValues(await loadConfig(".env"));
  } catch {
    values = { ...defaults };
  }

  const rl = readline.createInterface({ input, output });
  try {
    const ask = async (label: string, defaultValue: string): Promise<string> => {
      const answer = await rl.question(`${label} (${defaultValue}): `);
      return answer.trim() || defaultValue;
    };
    const confirm = async (label: string): Promise<boolean> => {
      const answer = await rl.question(`${label} [y/N]: `);
      return ["y", "yes"].includes(answer.trim().toLowerCase());
    };

    note(output, "Connection setup — press Enter to keep a suggested value.");
    for (const [key, label] of [
      ["QDRANT_BASE_URL", "Qdrant base URL (where the Qdrant vector database server is reachable or should be created)"],
      ["QDRANT_GRPC_PORT", "Qdrant gRPC port (used for ingest and chat; 6334 is the Docker default)"],
      ["QDRANT_API_KEY", "Qdrant API key (optional, needed by protected instances)"],
      ["OLLAMA_BASE_URL", "Ollama URL (where the Ollama server is reachable or should be created)"]
    ] as const) {
      values[key] = await ask(label, values[key] ?? "");
    }

    const parsedQdrant = parseQdrantUrl(values.QDRANT_BASE_URL);
    qdrantGrpcAddress(values.QDRANT_BASE_URL, values.QDRANT_GRPC_PORT);

    const qdrantUp = await isHttpHealthy(qdrantHealthUrl(values.QDRANT_BASE_URL));
    const ollamaUp = await isHttpHealthy(`${values.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/tags`);
    let localUnavailable = false;

    if (!qdrantUp) {
      if (isLocalhost(values.QDRANT_BASE_URL)) {
        output.write(`Qdrant is not reachable at ${values.QDRANT_BASE_URL}.\n`);
        localUnavailable = true;
      } else {
        output.write(`Qdrant is not reachable at ${values.QDRANT_BASE_URL} yet. Start that remote instance, then continue.\n`);
      }
    }
    if (!ollamaUp) {
      if (isLocalhost(values.OLLAMA_BASE_URL)) {
        output.write(`Ollama is not reachable at ${values.OLLAMA_BASE_URL}.\n`);
        localUnavailable = true;
      } else {
        output.write(`Ollama is not reachable at ${values.OLLAMA_BASE_URL} yet. Start that remote instance, then continue.\n`);
      }
    }

    if (localUnavailable && (await confirm("Start the local Docker Compose services now?"))) {
      const composePath = "docker-compose.yml";
      await access(composePath);
      await runComposeUp(composePath, parsedQdrant.port, values.QDRANT_GRPC_PORT, urlPort(values.OLLAMA_BASE_URL, "11434"));
    }

    note(output, "Index and chat settings");
    for (const [key, label] of [
      ["MARKDOWN_ROOT", "Dokumentationspfad"],
      ["COLLECTION_NAME", "Collection name (where indexed document vectors are stored)"],
      ["OLLAMA_MODEL", "Embedding-Modell für Ingest"],
      ["OLLAMA_EMBED_MODEL", "Embedding-Modell für Chat-Retrieval"],
      ["OLLAMA_CHAT_MODEL", "Chat-Modell"],
      ["EMBED_BATCH_SIZE", "Embedding batch size (texts embedded per Ollama request; increase for speed if memory allows)"],
      ["QDRANT_BATCH_SIZE", "Qdrant Batch Size"],
      ["UPLOAD_PARALLEL", "Upload Parallel"],
      ["DELETE_MISSING_FILES", "Delete missing files (true removes vectors whose source files are no longer indexed)"],
      ["RECREATE_COLLECTION", "Collection neu erstellen (true/false)"],
      ["PAYLOAD_INDEX_FIELDS", "Payload-Index-Felder (csv)"],
      ["CHAT_TOP_K", "Chat top-K (number of relevant document chunks passed to the chat model)"],
      ["CHAT_SCORE_THRESHOLD", "Chat score threshold (optional; omit to accept every retrieved chunk, or set a minimum similarity score)"],
      ["CHAT_SYSTEM_PROMPT", "Chat system prompt (instructions that constrain how answers use the retrieved context)"]
    ] as const) {
      values[key] = await ask(label, values[key] ?? "");
    }

    await writeEnvFile(".env", values);
    success(output, "Saved configuration to .env");

    let missing: string[];
    try {
      missing = await ollamaMissingModels(values.OLLAMA_BASE_URL, [
        values.OLLAMA_MODEL,
        values.OLLAMA_EMBED_MODEL,
        values.OLLAMA_CHAT_MODEL
      ]);
    } catch (err) {
      output.write(`Could not check selected Ollama models: ${(err as Error).message}\n`);
      return;
    }

    if (!missing.length) {
      success(output, "All selected Ollama models are installed.");
      return;
    }

    if (await confirm(`Missing Ollama models: ${missing.join(", ")}. Install them automatically?`)) {
      for (const model of missing) {
        output.write(`Installing Ollama model ${model}...\n`);
        await pullOllamaModel(values.OLLAMA_BASE_URL, model);
      }
      success(output, "Selected Ollama models installed.");
    }
  } finally {
    rl.close();
  }
}
