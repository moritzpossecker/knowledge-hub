import readline from "node:readline/promises";
import { askQuestion, QdrantClient, type Config } from "@knowledge-hub/core";
import { checkModelsInstalled } from "../checks/modelsInstalledCheck.js";
import { checkServersRunning } from "../checks/serversRunningCheck.js";

export { type Source } from "@knowledge-hub/core";

export async function runChat(
  config: Config,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
  await checkServersRunning(
    config.setup.qdrant.baseUrl,
    config.setup.qdrant.grpcPort,
    config.setup.ollama.baseUrl,
    config.setup.managedViaDocker,
    input,
    output
  );

  await checkModelsInstalled(
    config.setup.ollama.baseUrl,
    [config.chat.retrievalModel, config.chat.chatModel],
    input,
    output
  );

  const qdrant = new QdrantClient(config);
  const rl = readline.createInterface({ input, output });

  output.write(`Chat with ${config?.chat.chatModel}  ·  collection ${config?.sync.collectionName}\n`);
  output.write("Ask about your indexed documentation. Type /exit or /quit to leave.\n\n");

  try {
    while (true) {
      const raw = await rl.question("you › ");
      const question = raw.trim();
      if (!question) {
        continue;
      }
      const lower = question.toLowerCase();
      if (["exit", "quit", "/exit", "/quit"].includes(lower)) {
        output.write("\nSession closed.\n");
        return;
      }

      output.write("\nassistant · thinking…\n");
      const { answer, sources } = await askQuestion(qdrant, config, question);
      output.write(`\nassistant\n${answer}\n`);
      if (sources.length) {
        output.write("\nSources\n");
        for (const source of sources) {
          output.write(`  • ${source.sourcePath} — ${source.headingPath}\n`);
        }
        output.write("\n");
      }
    }
  } finally {
    rl.close();
  }
}
