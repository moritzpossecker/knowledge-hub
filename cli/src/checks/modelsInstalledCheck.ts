import readline from "node:readline/promises";
import { confirm, success, error } from "../ui.js";

export async function checkModelsInstalled(
  ollamaBaseUrl: string,
  requiredModels: string[],
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
  let missing: string[];
  
  try {
    missing = await getMissingModels(ollamaBaseUrl, requiredModels);
  } catch (err) {
    error(output, `Could not connect to Ollama to check models: ${(err as Error).message}`);
    process.exit(1);
  }

  if (missing.length === 0) {
    return;
  }
  const rl = readline.createInterface({ input, output });
  let installMissingModels = false;

  try {
    installMissingModels = await confirm(
      rl, output,
      `Missing Ollama models: ${missing.join(", ")}. Install them automatically?`,
      true
    );
  } finally {
    rl.close();
  }

  if (!installMissingModels) {
    error(output, `Cannot proceed without required models. Please run 'ollama pull <model>' manually.`);
    process.exit(1);
  }

  for (const model of missing) {
    output.write(`Installing Ollama model ${model} ...\n`);
    try {
      await pullOllamaModel(ollamaBaseUrl, model);
      success(output, `Successfully installed ${model}.`);
    } catch (err) {
      error(output, `Failed to install ${model}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  success(output, "All required Ollama models are now installed.");
}

interface TagsResponse {
  models?: Array<{ name: string }>;
}

function normalizeModelName(model: string): string {
  // If the user specifies a model without a tag, Ollama defaults to :latest.
  // We strip :latest so 'llama3.1' and 'llama3.1:latest' are treated as the same.
  return model.trim().replace(/:latest$/, "");
}

async function getMissingModels(baseUrl: string, requiredModels: string[]): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as TagsResponse;

  const installedModels = payload.models?.map((m) => normalizeModelName(m.name))
    .filter(Boolean) ?? [];

  const uniqueRequired = Array.from(new Set(requiredModels));

  return uniqueRequired.filter((model) => {
    const normalizedModel = normalizeModelName(model);
    return !installedModels.includes(normalizedModel);
  });
}

async function pullOllamaModel(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: model, stream: false })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}
