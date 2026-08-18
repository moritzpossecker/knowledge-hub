import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface Chunk {
  pointId: string;
  documentId: string;
  sourcePath: string;
  fileName: string;
  title: string;
  headings: string[];
  headingPath: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  fileHash: string;
  modifiedAt: string;
}

interface MarkdownSection {
  headings: string[];
  content: string;
}

const markdownExtensions = new Set([".md", ".markdown", ".mdown", ".mkd"]);

export async function iterMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && markdownExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

export async function buildChunks(root: string, filePath: string): Promise<Chunk[]> {
  const raw = await readFile(filePath, "utf8");
  const info = await stat(filePath);
  const modifiedAt = info.mtime.toISOString();
  const { frontmatter, body } = extractFrontmatter(raw);
  const title = cleanTitle(filePath, frontmatter, body);
  const fileHash = sha256Text(raw);
  const sourcePath = path.relative(root, filePath).split(path.sep).join("/");
  const documentId = uuidV5(sourcePath, "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
  const sections = splitMarkdownByHeadings(body);

  return sections.map((section, index) => {
    const contentHash = sha256Text(section.content);
    const pointId = uuidV5(`${sourcePath}:${index}:${contentHash}`, "6ba7b812-9dad-11d1-80b4-00c04fd430c8");
    return {
      pointId,
      documentId,
      sourcePath,
      fileName: path.basename(filePath),
      title,
      headings: section.headings,
      headingPath: section.headings.length ? section.headings.join(" > ") : title,
      chunkIndex: index,
      content: section.content,
      contentHash,
      fileHash,
      modifiedAt
    };
  });
}

function extractFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  if (!text.startsWith("---\n")) {
    return { frontmatter: {}, body: text };
  }
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text };
  }
  return { frontmatter: parseSimpleYaml(match[1]), body: text.slice(match[0].length) };
}

function parseSimpleYaml(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function cleanTitle(filePath: string, frontmatter: Record<string, string>, body: string): string {
  const frontmatterTitle = frontmatter.title?.trim();
  if (frontmatterTitle) {
    return frontmatterTitle;
  }
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return path
    .basename(filePath, path.extname(filePath))
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .trim();
}

function splitMarkdownByHeadings(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let headings: string[] = [];
  let current: string[] = [];
  const headingPattern = /^(#{1,6})\s+(.*\S)\s*$/;

  const flush = () => {
    const content = current.join("\n").trim();
    if (content) {
      sections.push({ headings: [...headings], content });
    }
    current = [];
  };

  for (const line of text.split("\n")) {
    const match = headingPattern.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      const heading = match[2].trim();
      if (level - 1 < headings.length) {
        headings = headings.slice(0, level - 1);
      }
      headings.push(heading);
      current = [line];
    } else {
      current.push(line);
    }
  }

  flush();
  if (sections.length) {
    return sections;
  }
  const fallback = text.trim();
  return fallback ? [{ headings: [], content: fallback }] : [];
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
