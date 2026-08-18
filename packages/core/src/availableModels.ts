interface TagsResponse {
  models?: Array<{ name: string }>;
}

export function normalizeModelName(model: string): string {
  return model.trim().replace(/:latest$/, "");
}

export async function getAvailableModels(
  ollamaBaseUrl: string
): Promise<string[]> {
  const response = await fetch(`${ollamaBaseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TagsResponse;

  const installedModels =
    payload.models
      ?.map((m) => normalizeModelName(m.name))
      .filter(Boolean) ?? [];

  return installedModels;
}
