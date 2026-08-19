import type { Config } from "./config.js";
import { payloadString, type QdrantClient } from "./qdrant.js";

export interface Source {
  sourcePath: string;
  headingPath: string;
}

export async function askQuestion(
  qdrant: QdrantClient,
  config: Config,
  question: string,
  signal?: AbortSignal
): Promise<{ answer: string; sources: Source[] }> {
  
  const embeddings = await fetch(`${config.setup.ollama.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.sync.embedModel, input: [question] }),
    signal,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`ollama embed failed: ${(await response.text()).trim() || `HTTP ${response.status}`}`);
    }
    return (await response.json()) as { embeddings?: number[][] };
  });

  const vector = embeddings.embeddings?.[0];
  if (!vector) {
    throw new Error("ollama returned no embeddings");
  }

  const payloads = await qdrant.search(
    config.sync.collectionName,
    vector,
    config.chat.topK,
    config.chat.scoreThreshold
  );

  const contextParts: string[] = [];
  const sourceMap = new Map<string, Source>();

  for (const payload of payloads) {
    const sourcePath = payloadString(payload, "source_path");
    const headingPath = payloadString(payload, "heading_path");
    const content = payloadString(payload, "content");
    contextParts.push(`Source: ${sourcePath}\nSection: ${headingPath}\nContent:\n${content}`);
    sourceMap.set(`${sourcePath} — ${headingPath}`, { sourcePath, headingPath });
  }

  const userPrompt = `Context:\n${contextParts.join("\n\n---\n\n")}\n\nQuestion: ${question}`;
  const systemPrompt = config.chat.systemPrompt + "\nWhen useful, cite source paths from the context. Do it by writing the source path of the source in double square brackets, e.g. [toc.md].";

  const chatResponse = await fetch(`${config.setup.ollama.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.chat.chatModel,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal,
  });

  if (!chatResponse.ok) {
    throw new Error(`ollama chat failed: ${(await chatResponse.text()).trim() || `HTTP ${chatResponse.status}`}`);
  }

  const chatPayload = (await chatResponse.json()) as { message?: { content?: string } };
  const answer = chatPayload.message?.content?.trim() ?? "";
  const sources = [...sourceMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, source]) => source);

  return { answer, sources };
}
