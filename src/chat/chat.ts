import readline from "node:readline/promises";
import { Config } from "../config/config.js";
import { payloadString, QdrantClient } from "../qdrant.js";
import { ollamaChat, ollamaEmbed } from "../ollama.js";

export async function runChat(
  config: Config,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
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
          output.write(`  • ${source}\n`);
        }
        output.write("\n");
      }
    }
  } finally {
    rl.close();
  }
}

async function askQuestion(
  qdrant: QdrantClient,
  config: Config,
  question: string
): Promise<{ answer: string; sources: string[] }> {
  const embeddings = await ollamaEmbed(config.setup.ollama.baseUrl, config.chat.retrievalModel, [question]);
  const payloads = await qdrant.search(
    config.sync.collectionName,
    embeddings[0],
    config.chat.topK,
    config.chat.scoreThreshold
  );

  if (!payloads.length) {
    return { answer: "Ich konnte in den indexierten Dokumenten nichts Passendes finden.", sources: [] };
  }

  const contextParts: string[] = [];
  const sourceSet = new Set<string>();
  for (const payload of payloads) {
    const sourcePath = payloadString(payload, "source_path");
    const headingPath = payloadString(payload, "heading_path");
    const content = payloadString(payload, "content");
    contextParts.push(`Source: ${sourcePath}\nSection: ${headingPath}\nContent:\n${content}`);
    sourceSet.add(`${sourcePath} — ${headingPath}`);
  }

  const prompt = `Use the following documentation context to answer the question. If the answer is not in the context, say so clearly.

Context:
${contextParts.join("\n\n---\n\n")}

Question: ${question}`;

  return {
    answer: await ollamaChat(config.setup.ollama.baseUrl, config.chat.chatModel, config.chat.systemPrompt, prompt),
    sources: [...sourceSet].sort()
  };
}
