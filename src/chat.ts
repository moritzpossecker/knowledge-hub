import readline from "node:readline/promises";
import type { Config } from "./config.js";
import { ollamaChat, ollamaEmbed } from "./ollama.js";
import { payloadString, QdrantClient } from "./qdrant.js";

export async function runChat(
  config: Config,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): Promise<void> {
  const qdrant = new QdrantClient(config);
  const rl = readline.createInterface({ input, output });

  output.write(`Chat with ${config.ollamaChatModel}  ·  collection ${config.collectionName}\n`);
  output.write("Ask about your indexed documentation. Type /exit to leave.\n\n");

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
  const embeddings = await ollamaEmbed(config.ollamaBaseUrl, config.ollamaEmbedModel, [question]);
  const payloads = await qdrant.search(
    config.collectionName,
    embeddings[0],
    config.chatTopK,
    config.chatScoreThreshold
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
    answer: await ollamaChat(config.ollamaBaseUrl, config.ollamaChatModel, config.chatSystemPrompt, prompt),
    sources: [...sourceSet].sort()
  };
}
