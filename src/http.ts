import net from "node:net";

export function qdrantHealthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/collections`;
}

export function parseQdrantUrl(raw: string): { host: string; port: string; useHttps: boolean } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch (err) {
    throw new Error(`invalid Qdrant URL: ${(err as Error).message}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Qdrant URL must start with http:// or https://");
  }
  if (!url.hostname) {
    throw new Error("Qdrant URL must include a host");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    throw new Error("Qdrant URL must contain only scheme, host, and optional port");
  }
  return {
    host: normalizeUrlHostname(url.hostname),
    port: url.port || (url.protocol === "https:" ? "443" : "6333"),
    useHttps: url.protocol === "https:"
  };
}

export function qdrantGrpcAddress(baseUrl: string, grpcPort: string | number): string {
  const { host } = parseQdrantUrl(baseUrl);
  const port = Number.parseInt(String(grpcPort), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid Qdrant gRPC port ${JSON.stringify(String(grpcPort))}`);
  }
  return net.isIPv6(host) ? `[${host}]:${port}` : `${host}:${port}`;
}

export function urlPort(rawUrl: string, defaultPort: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`invalid URL ${JSON.stringify(rawUrl)}`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error(`invalid URL ${JSON.stringify(rawUrl)}`);
  }
  return url.port || defaultPort;
}

export function isLocalhost(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = normalizeUrlHostname(url.hostname).toLowerCase().replace(/\.$/, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return false;
  }
}

function normalizeUrlHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)]$/, "$1");
}

export async function isHttpHealthy(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
