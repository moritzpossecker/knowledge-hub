import { spawn } from "node:child_process";

export async function runComposeUp(
  composePath: string,
  qdrantHttpPort: string,
  qdrantGrpcPort: string,
  ollamaPort: string
): Promise<void> {
  for (const [name, value] of [
    ["Qdrant HTTP", qdrantHttpPort],
    ["Qdrant gRPC", qdrantGrpcPort],
    ["Ollama", ollamaPort]
  ] as const) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`invalid ${name} port ${JSON.stringify(value)}`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", composePath, "up", "-d"], {
      stdio: "inherit",
      env: {
        ...process.env,
        QDRANT_HTTP_PORT: qdrantHttpPort,
        QDRANT_GRPC_PORT: qdrantGrpcPort,
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
