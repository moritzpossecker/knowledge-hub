import type { Config } from "./config/config.js";

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

interface SearchResult {
  payload?: Record<string, unknown>;
}

interface ScrollResponse {
  result?: {
    points?: Array<{ id?: string; payload?: Record<string, unknown> }>;
    next_page_offset?: unknown;
  };
}

interface SearchResponse {
  result?: SearchResult[];
}

interface CollectionInfoResponse {
  result?: {
    status?: string;
    points_count?: number;
  };
}

export class QdrantClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: Config) {
    this.baseUrl = config.setup.qdrant.baseUrl;
    this.apiKey = config.setup.qdrant.apiKey;
  }

  async collectionInfo(collectionName: string): Promise<{ status: string; pointsCount: number }> {
    const payload = await this.request<CollectionInfoResponse>(`/collections/${encodeURIComponent(collectionName)}`);
    return {
      status: payload.result?.status ?? "unknown",
      pointsCount: payload.result?.points_count ?? 0
    };
  }

  async ensureCollection(collectionName: string, vectorSize: number, recreate: boolean): Promise<void> {
    if (recreate) {
      await this.request(`/collections/${encodeURIComponent(collectionName)}`, { method: "DELETE", tolerateNotFound: true });
    }
    const exists = await this.exists(collectionName);
    if (!exists) {
      await this.request(`/collections/${encodeURIComponent(collectionName)}`, {
        method: "PUT",
        body: {
          vectors: {
            size: vectorSize,
            distance: "Cosine"
          }
        }
      });
    }
  }

  async deleteDocumentPoints(collectionName: string, documentId: string): Promise<void> {
    await this.request(`/collections/${encodeURIComponent(collectionName)}/points/delete?wait=true`, {
      method: "POST",
      body: {
        filter: {
          must: [
            {
              key: "document_id",
              match: { value: documentId }
            }
          ]
        }
      }
    });
  }

  async upsertPoints(collectionName: string, points: QdrantPoint[]): Promise<void> {
    await this.request(`/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
      method: "PUT",
      body: { points }
    });
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
      with_payload: true
    };
    if (scoreThreshold !== undefined) {
      payload.score_threshold = scoreThreshold;
    }
    const response = await this.request<SearchResponse>(`/collections/${encodeURIComponent(collectionName)}/points/search`, {
      method: "POST",
      body: payload
    });
    return (response.result ?? []).map((point) => point.payload ?? {});
  }

  async scrollPayloads(
    collectionName: string,
    limit: number,
    offset?: unknown
  ): Promise<{ payloads: Array<Record<string, unknown>>; nextOffset?: unknown }> {
    const body: Record<string, unknown> = {
      limit,
      with_payload: true,
      with_vector: false
    };
    if (offset !== undefined) {
      body.offset = offset;
    }
    const response = await this.request<ScrollResponse>(`/collections/${encodeURIComponent(collectionName)}/points/scroll`, {
      method: "POST",
      body
    });
    return {
      payloads: (response.result?.points ?? []).map((point) => point.payload ?? {}),
      nextOffset: response.result?.next_page_offset
    };
  }

  private async exists(collectionName: string): Promise<boolean> {
    try {
      await this.collectionInfo(collectionName);
      return true;
    } catch (err) {
      if (err instanceof QdrantHttpError && err.status === 404) {
        return false;
      }
      throw err;
    }
  }

  private async request<T = unknown>(
    route: string,
    options: { method?: string; body?: unknown; tolerateNotFound?: boolean } = {}
  ): Promise<T> {
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
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.ok) {
      if (options.tolerateNotFound && response.status === 404) {
        return undefined as T;
      }
      const message = (await response.text()).trim() || `HTTP ${response.status}`;
      throw new QdrantHttpError(response.status, message);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

class QdrantHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(`Qdrant request failed: ${message}`);
  }
}

export function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}
