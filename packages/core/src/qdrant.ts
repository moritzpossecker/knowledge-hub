export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export class QdrantClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: { setup: { qdrant: { baseUrl: string; apiKey?: string } } }) {
    this.baseUrl = config.setup.qdrant.baseUrl;
    this.apiKey = config.setup.qdrant.apiKey;
  }

  async search(
    collectionName: string,
    vector: number[],
    limit: number,
    scoreThreshold?: number
  ): Promise<Array<Record<string, unknown>>> {
    const payload: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    };
    if (scoreThreshold !== undefined) {
      payload.score_threshold = scoreThreshold;
    }

    const response = await this.request<SearchResponse>(`/collections/${encodeURIComponent(collectionName)}/points/search`, {
      method: "POST",
      body: payload,
    });

    return (response.result ?? []).map((point) => point.payload ?? {});
  }

  async scrollPayloads(
    collectionName: string,
    limit: number,
    offset?: unknown,
    filter?: Record<string, unknown>
  ): Promise<{ payloads: Array<Record<string, unknown>>; nextOffset?: unknown }> {
    const body: Record<string, unknown> = { limit, with_payload: true, with_vector: false };
    if (offset !== undefined) {
      body.offset = offset;
    }
    if (filter !== undefined) {
      body.filter = filter;
    }

    const response = await this.request<ScrollResponse>(`/collections/${encodeURIComponent(collectionName)}/points/scroll`, {
      method: "POST",
      body,
    });

    return {
      payloads: (response.result?.points ?? []).map((point) => point.payload ?? {}),
      nextOffset: response.result?.next_page_offset,
    };
  }

  private async request<T = unknown>(route: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${route}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      const message = (await response.text()).trim() || `HTTP ${response.status}`;
      throw new Error(`Qdrant request failed: ${message}`);
    }

    return (await response.json()) as T;
  }
}

interface SearchResponse {
  result?: Array<{ payload?: Record<string, unknown> }>;
}

interface ScrollResponse {
  result?: {
    points?: Array<{ payload?: Record<string, unknown> }>;
    next_page_offset?: unknown;
  };
}

export function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}
