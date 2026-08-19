import readline from "node:readline/promises";
import { ask, confirm, error, heading, subheading, success } from "../ui.js";
import { Config, getConfigFilePath, loadCoreConfig, writeConfigFile } from "./config.js";
import { defaultConfig } from "./defaultConfig.js";
import { openInEditor } from "./editor.js";

export async function runUpdateConfig(
  manual: boolean,
  setup: boolean,
  sync: boolean,
  chat: boolean,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
  if (manual) {
    try {
      const configPath = getConfigFilePath();
      await openInEditor(configPath);
      success(output, `Manual configuration of ${configPath} complete.`);
    } catch (err) {
      error(output, (err as Error).message);
    }
    return;
  }
  let config: Config;
  try {
    config = await loadCoreConfig();
  }
  catch {
    config = JSON.parse(JSON.stringify(defaultConfig)) as Config;
  }

  const rl = readline.createInterface({ input, output });

  try {
    const runAll = !setup && !sync && !chat;

    if (runAll || setup) {
      config = await configureSetup(rl, output, config);
    }

    if (runAll || sync) {
      config = await configureSync(rl, output, config);
    }

    if (runAll || chat) {
      config = await configureChat(rl, output, config);
    }

    await writeConfigFile(config);
    output.write("\n");
    success(output, `Successfully saved configuration.`);
  } finally {
    rl.close();
  }
}

async function configureSetup(rl: readline.Interface, output: NodeJS.WritableStream, config: Config): Promise<Config> {
  heading(output, "Connection Setup", "Press Enter to keep the current values.");

  config.setup.managedViaDocker = await confirm(rl, output, "Do you want to automatically manage Qdrant and Ollama via Docker Compose?", config.setup.managedViaDocker);
  config.setup.ollama.baseUrl = await ask(rl, output, "Ollama base URL", config.setup.ollama.baseUrl);
  config.setup.qdrant.baseUrl = await ask(rl, output, "Qdrant base URL", config.setup.qdrant.baseUrl);
  config.setup.qdrant.grpcPort = parseInt(await ask(rl, output, "Qdrant gRPC port", config.setup.qdrant.grpcPort.toString()), 10);
  config.setup.qdrant.apiKey = await ask(rl, output, "Qdrant API key (leave empty if not required)", config.setup.qdrant.apiKey ?? "") ?? undefined;

  return config;
}

async function configureSync(rl: readline.Interface, output: NodeJS.WritableStream, config: Config): Promise<Config> {
  heading(output, "Sync Configuration", "Press Enter to keep the current values.");

  config.sync.markdownRootPath = await ask(rl, output, "Path to the root directory of your documentation files", config.sync.markdownRootPath);
  config.sync.collectionName = await ask(rl, output, "Name of the collection", config.sync.collectionName);
  config.sync.embedModel = await ask(rl, output, "Embedding model for indexing", config.sync.embedModel);

  subheading(output, "Performance Tuning (Advanced)");

  config.sync.embedBatchSize = parseInt(await ask(rl, output, "Embedding batch size (chunks sent to Ollama per request - lower this if Ollama runs out of memory)", config.sync.embedBatchSize.toString()), 10);
  config.sync.qdrantBatchSize = parseInt(await ask(rl, output, "Qdrant batch size (number of vectors grouped in one insert request to the database)", config.sync.qdrantBatchSize.toString()), 10);
  config.sync.uploadParallel = parseInt(await ask(rl, output, "Parallel uploads (concurrent upload streams - increase for speed, decrease for stability)", config.sync.uploadParallel.toString()), 10);

  return config;
}

async function configureChat(rl: readline.Interface, output: NodeJS.WritableStream, config: Config): Promise<Config> {
  heading(output, "Chat Configuration", "Press Enter to keep the current values.");

  config.chat.chatModel = await ask(rl, output, "Chat model for answering questions", config.chat.chatModel);

  subheading(output, "Retrieval Tuning (Advanced)");

  config.chat.topK = parseInt(await ask(rl, output, "Number of top results to retrieve from the index", config.chat.topK.toString()), 10);
  config.chat.scoreThreshold = parseFloat(await ask(rl, output, "Score threshold for filtering retrieved results (0.0 - 1.0)", config.chat.scoreThreshold.toString()));
  config.chat.systemPrompt = await ask(rl, output, "System prompt for the chat model", config.chat.systemPrompt);

  return config;
}
