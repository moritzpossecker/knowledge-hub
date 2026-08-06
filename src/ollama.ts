interface EmbedResponse {
  embeddings?: number[][];
}

interface TagsResponse {
  models?: Array<{ name: string }>;
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

export function missingOllamaModels(installedModels: string[], requestedModels: string[]): string[] {
  const installed = new Set<string>();
  for (const model of installedModels) {
    installed.add(model);
    installed.add(model.replace(/:latest$/, ""));
  }

  const seen = new Set<string>();
  const missing: string[] = [];
  for (const rawModel of requestedModels) {
    const model = rawModel.trim();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    if (!installed.has(model)) {
      missing.push(model);
    }
  }
  return missing;
}

export async function ollamaMissingModels(baseUrl: string, models: string[]): Promise<string[]> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as TagsResponse;
  return missingOllamaModels(
    (payload.models ?? []).map((model) => model.name),
    models
  );
}

export async function pullOllamaModel(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: model, stream: false })
  });
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status} while installing ${model}`);
  }
}
