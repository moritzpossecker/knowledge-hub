import { Agent } from "undici";

interface EmbedResponse {
  embeddings?: number[][];
}

interface ChatResponse {
  message?: {
    content?: string;
  };
}

// Local CPU-only inference can take well past undici's default 5-minute headers
// timeout for a single non-streamed response, so disable it for Ollama requests.
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `HTTP ${response.status}`;
}

export async function ollamaEmbed(
  baseUrl: string,
  model: string,
  texts: string[],
  signal?: AbortSignal
): Promise<number[][]> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: texts }),
    dispatcher,
    signal
  } as RequestInit);
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
  userPrompt: string,
  signal?: AbortSignal
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
    }),
    dispatcher,
    signal
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`ollama chat failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as ChatResponse;
  return payload.message?.content?.trim() ?? "";
}
