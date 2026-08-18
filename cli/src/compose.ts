import { spawn } from "node:child_process";

export async function runComposeUp(
  composePath: string,
  qdrantBaseUrl: string,
  qdrantGrpcPort: number,
  ollamaBaseUrl: string
): Promise<void> {
  const qdrantHttpPort = new URL(qdrantBaseUrl).port;
  const ollamaPort = new URL(ollamaBaseUrl).port;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", composePath, "up", "-d"], {
      stdio: "inherit",
      env: {
        ...process.env,
        QDRANT_HTTP_PORT: qdrantHttpPort,
        QDRANT_GRPC_PORT: qdrantGrpcPort.toString(10),
        OLLAMA_PORT: ollamaPort
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose up failed with exit code ${code}`));
      }
    });
  });
}
