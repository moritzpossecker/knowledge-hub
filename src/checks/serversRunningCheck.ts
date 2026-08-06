import readline from "node:readline/promises";
import { error, confirm } from "../ui.js";
import { rawListeners } from "process";
import { runComposeUp } from "../compose.js";
import { access } from "node:fs/promises";

export async function checkServersRunning(
  qdrantBaseUrl: string,
  ollamaBaseUrl: string,
  qdrantGrpcPort: number,
  managedViaDocker: boolean,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {

  const qdrantUp = await isHttpHealthy(`${qdrantBaseUrl}/collections`);
  const ollamaUp = await isHttpHealthy(`${ollamaBaseUrl}/api/tags`);

  if (qdrantUp && ollamaUp) {
    return;
  }

  if (!qdrantUp) {
        output.write(`Qdrant is not reachable at ${qdrantBaseUrl}.\n`);
  }
  if (!ollamaUp) {
        output.write(`Ollama is not reachable at ${ollamaBaseUrl}.\n`);
  }

  if (!managedViaDocker) {
    error(output, `Cannot proceed without required services. Please start the required services and try again.`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  let startServicesAutomatically = false;

  try {
    startServicesAutomatically = await confirm(rl, output, "Start the local Docker Compose services now?", true);
  }
  finally {
    rl.close();
  }

  if (!startServicesAutomatically) {
    error(output, `Cannot proceed without required services. Please start the required services and try again.`);
    process.exit(1);
  }

  const composePath = "docker-compose.yml";
  await access(composePath);
  await runComposeUp(composePath, qdrantBaseUrl, qdrantGrpcPort, ollamaBaseUrl);
}

async function isHttpHealthy(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
