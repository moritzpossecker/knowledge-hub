interface EmbedResponse {
  embeddings?: number[][];
}

interface ChatResponse {
  message?: {
    content?: string;
  };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `HTTP ${response.status}`;
}

export async function ollamaEmbed(baseUrl: string, model: string, texts: string[]): Promise<number[][]> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: texts })
  });
  if (!response.ok) {
    throw new Error(`ollama embed failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as EmbedResponse;
  if (!payload.embeddings?.length) {
    throw new Error("ollama returned no embeddings");
  }
  return payload.embeddings;
}

export async function ollamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`ollama chat failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as ChatResponse;
  return payload.message?.content?.trim() ?? "";
}
