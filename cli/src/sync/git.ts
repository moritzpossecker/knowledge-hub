import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function isGitUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("git@");
}

export async function cloneRepo(url: string): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "knowledge-hub-repo-"));
  const target = path.join(dir, "repo");
  try {
    await execFileAsync("git", ["clone", "--depth", "1", url, target]);
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    const stderr = typeof (err as { stderr?: unknown }).stderr === "string" ? (err as { stderr: string }).stderr : "";
    throw new Error(`git clone failed: ${stderr.trim() || (err as Error).message}`);
  }
  return {
    root: target,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}
