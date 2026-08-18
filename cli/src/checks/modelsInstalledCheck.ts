import { error, success, confirm } from "../ui.js";
import { getAvailableModels, normalizeModelName } from "@knowledge-hub/core";
import readline from "node:readline/promises";

async function getMissingModels(
  baseUrl: string,
  requiredModels: string[]
): Promise<string[]> {
  const installedModels = await getAvailableModels(baseUrl);
  const uniqueRequired = Array.from(new Set(requiredModels));

  return uniqueRequired.filter((model) => {
    const normalizedModel = normalizeModelName(model);
    return !installedModels.includes(normalizedModel);
  });
}

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
      rl,
      output,
      `Missing Ollama models: ${missing.join(", ")}. Install them automatically?`,
      true
    );
  } finally {
    rl.close();
  }

  if (!installMissingModels) {
    error(
      output,
      `Cannot proceed without required models. Please run 'ollama pull <model>' manually.`
    );
    process.exit(1);
  }

  for (const model of missing) {
    output.write(`Installing Ollama model ${model}...\n`);
    try {
      await pullOllamaModel(ollamaBaseUrl, model, output);
      success(output, `Successfully installed ${model}.`);
    } catch (err) {
      error(output, `Failed to install ${model}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  success(output, "All required Ollama models are now installed.");
}

async function pullOllamaModel(
  baseUrl: string,
  model: string,
  output: NodeJS.WritableStream
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("No response body from Ollama");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let lastStatus = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Ollama sends one JSON object per line
      const lines = chunk.split("\n").filter((l) => l.trim() !== "");

      for (const line of lines) {
        const event = JSON.parse(line) as {
          status: string;
          digest?: string;
          total?: number;
          completed?: number;
        };

        const statusText = event.status;

        if (statusText !== lastStatus) {
          // Neue Phase → neue Zeile, damit der Nutzer den Wechsel sieht
          if (lastStatus !== "") {
            output.write("\n");
          }
          lastStatus = statusText;
        }

        if (event.total != null && event.completed != null) {
          const percent = Math.round((event.completed / event.total) * 100);
          output.write(`\r${statusText}... ${percent}%`);
        } else {
          // Kein Fortschrittsbalken möglich, aber Status anzeigen
          output.write(`\r${statusText}...`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Zeilenumbruch nach dem letzten "\r"-Output
  output.write("\n");
}
