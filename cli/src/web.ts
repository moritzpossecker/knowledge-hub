import { spawn } from "node:child_process";
import { getConfigFilePath } from "./config/config.js";

const DOCKER_IMAGE = "ghcr.io/your-org/knowledge-hub:latest";
const CONTAINER_NAME = "knowledge-hub-web";
const HOST_PORT = "3000";
const CONTAINER_PORT = "3000";

export async function runWeb(stdout: NodeJS.WriteStream) {
  const configPath = getConfigFilePath();

  const containerExists = await containerExistsCheck(stdout);

  if (containerExists) {
    stdout.write(`Container ${CONTAINER_NAME} exists, starting...\n`);
    await runCommand("docker", ["start", CONTAINER_NAME], stdout);
  } else {
    stdout.write(`Pulling Docker image ${DOCKER_IMAGE}...\n`);
    await runCommand("docker", ["pull", DOCKER_IMAGE], stdout);

    stdout.write(`Creating and starting container ${CONTAINER_NAME}...\n`);
    await runCommand(
      "docker",
      [
        "run",
        "-d",
        "--name", CONTAINER_NAME,
        "-p", `${HOST_PORT}:${CONTAINER_PORT}`,
        "-e", `KH_DB_PATH=/var/lib/knowledge-hub/data/knowledge-hub.db`,
        "-e", `KH_CONFIG_DIR=/var/lib/knowledge-hub/config`,
        "-v", `${configPath}:/var/lib/knowledge-hub/config/config.json:ro`,
        DOCKER_IMAGE,
      ],
      stdout
    );
  }

  stdout.write(`Web interface started on: http://localhost:${HOST_PORT}\n`);
}

async function containerExistsCheck(stdout: NodeJS.WriteStream): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["ps", "-a", "--format", "{{.Names}}"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      const exists = output
        .split("\n")
        .map((line) => line.trim())
        .includes(CONTAINER_NAME);
      resolve(exists);
    });
  });
}

async function runCommand(cmd: string, args: string[], stdout: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", stdout, stdout] });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
