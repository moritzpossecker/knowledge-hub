import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { v5 as uuidV5 } from "uuid";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

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

interface OllamaShowResponse {
  model_info?: Record<string, number>;
  parameters?: string;
  details?: {
    context_length?: number;
  };
}

interface FileMetadata {
  sourcePath: string;
  documentId: string;
  title: string;
  fileHash: string;
  modifiedAt: string;
  fileName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const CHUNK_SAFETY_FACTOR = 0.8; // 20% Puffer für Overhead
const DEFAULT_CONTEXT_LIMIT = 2048;
const UUID_NAMESPACE_DOCUMENT = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const UUID_NAMESPACE_CHUNK = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";
const OVERLAP_TOKENS = 100; // Feste Overlap-Größe für Kontinuität

// ─────────────────────────────────────────────────────────────────────────────
// Ollama API Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ermittelt das maximale Kontext-Limit eines Ollama-Embedding-Modells.
 */
export async function getModelContextLimit(
  ollamaUrl: string,
  modelName: string
): Promise<number> {
  const response = await fetchOllamaModelInfo(ollamaUrl, modelName);
  return extractContextLengthFromResponse(response, modelName);
}

async function fetchOllamaModelInfo(
  ollamaUrl: string,
  modelName: string
): Promise<OllamaShowResponse> {
  const response = await fetch(`${ollamaUrl}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, verbose: true }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error (${response.status}): ${response.statusText}`
    );
  }

  return response.json() as Promise<OllamaShowResponse>;
}

function extractContextLengthFromResponse(
  data: OllamaShowResponse,
  modelName: string
): number {
  const contextKeys = Object.keys(data.model_info || {}).filter((key) =>
    key.endsWith(".context_length")
  );

  if (contextKeys.length > 0) {
    return data.model_info![contextKeys[0]];
  }

  if (data.details?.context_length) {
    return data.details.context_length;
  }

  throw new Error(
    `No context limit found for model "${modelName}". Default: ${DEFAULT_CONTEXT_LIMIT}`
  );
}

/**
 * Berechnet eine sichere Chunk-Größe mit Sicherheitspuffer.
 */
export function calculateSafeChunkSize(maxContext: number): number {
  const safeLimit = Math.floor(maxContext * CHUNK_SAFETY_FACTOR);
  return clamp(safeLimit, 256, 4096);
}

// ─────────────────────────────────────────────────────────────────────────────
// File System Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Iteriert rekursiv über alle Markdown-Dateien in einem Verzeichnis.
 */
export async function iterMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walkDirectory(root, files);
  return files.sort();
}

async function walkDirectory(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, files);
    } else if (isMarkdownFile(entry)) {
      files.push(fullPath);
    }
  }
}

function isMarkdownFile(entry: import("node:fs").Dirent): boolean {
  return entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunking Logic (Main Entry Point)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zerlegt eine Markdown-Datei in Chunks mit dynamischer Größenbegrenzung und Overlap.
 */
export async function buildChunks(
  root: string,
  filePath: string,
  ollamaUrl: string,
  embeddingModel: string
): Promise<Chunk[]> {
  const maxContext = await getModelContextLimit(ollamaUrl, embeddingModel);
  const maxChunkTokens = calculateSafeChunkSize(maxContext);

  const fileContent = await readFile(filePath, "utf8");
  const fileStats = await stat(filePath);
  const { frontmatter, body } = extractFrontmatter(fileContent);

  const metadata = buildFileMetadata(root, filePath, fileContent, frontmatter, fileStats);
  const sections = splitMarkdownByHeadings(body);
  const limitedSections = applyChunkSizeLimit(sections, maxChunkTokens, OVERLAP_TOKENS);

  return sectionsToChunks(limitedSections, metadata);
}

function buildFileMetadata(
  root: string,
  filePath: string,
  rawContent: string,
  frontmatter: Record<string, string>,
  fileStats: import("node:fs").Stats
): FileMetadata {
  const sourcePath = path.relative(root, filePath).split(path.sep).join("/");
  return {
    sourcePath,
    documentId: uuidV5(sourcePath, UUID_NAMESPACE_DOCUMENT),
    title: cleanTitle(filePath, frontmatter, rawContent),
    fileHash: sha256Text(rawContent),
    modifiedAt: fileStats.mtime.toISOString(),
    fileName: path.basename(filePath),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk Size Limiting & Fallback with Overlap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wendet Chunk-Size-Limit an und nutzt Fallback-Splitting mit Overlap.
 */
function applyChunkSizeLimit(
  sections: MarkdownSection[],
  maxTokens: number,
  overlapTokens: number
): MarkdownSection[] {
  const result: MarkdownSection[] = [];

  for (const section of sections) {
    const tokenCount = estimateTokens(section.content);

    if (tokenCount <= maxTokens) {
      result.push(section);
    } else {
      const splitSections = splitLargeSectionWithOverlap(
        section,
        maxTokens,
        overlapTokens
      );
      result.push(...splitSections);
    }
  }

  return result;
}

/**
 * Zerlegt eine zu große Section an Absätzen mit Overlap zwischen Chunks.
 */
function splitLargeSectionWithOverlap(
  section: MarkdownSection,
  maxTokens: number,
  overlapTokens: number
): MarkdownSection[] {
  const paragraphs = section.content.split(/\n\n+/);
  const chunks: MarkdownSection[] = [];
  let currentContent = "";

  for (const paragraph of paragraphs) {
    const potentialContent = currentContent
      ? `${currentContent}\n\n${paragraph}`
      : paragraph;

    if (estimateTokens(potentialContent) > maxTokens && currentContent) {
      // Chunk speichern
      chunks.push({ headings: [...section.headings], content: currentContent });

      // Overlap vorbereiten: Letzte Tokens des aktuellen Chunks als Start für nächsten
      const overlapContent = extractOverlap(currentContent, overlapTokens);
      currentContent = overlapContent ? `${overlapContent}\n\n${paragraph}` : paragraph;
    } else {
      currentContent = potentialContent;
    }
  }

  if (currentContent.trim()) {
    chunks.push({ headings: [...section.headings], content: currentContent });
  }

  return chunks.length > 0 ? chunks : [section];
}

/**
 * Extrahiert die letzten N Tokens aus einem Text für Overlap.
 */
function extractOverlap(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  const estimatedTokensPerWord = 1.3; // Grobe Schätzung
  const wordsNeeded = Math.ceil(overlapTokens / estimatedTokensPerWord);

  if (words.length <= wordsNeeded) {
    return text;
  }

  return words.slice(-wordsNeeded).join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Section to Chunk Conversion
// ─────────────────────────────────────────────────────────────────────────────

function sectionsToChunks(
  sections: MarkdownSection[],
  metadata: FileMetadata
): Chunk[] {
  return sections.map((section, index) => {
    const contentHash = sha256Text(section.content);
    return {
      pointId: uuidV5(
        `${metadata.sourcePath}:${index}:${contentHash}`,
        UUID_NAMESPACE_CHUNK
      ),
      documentId: metadata.documentId,
      sourcePath: metadata.sourcePath,
      fileName: metadata.fileName,
      title: metadata.title,
      headings: section.headings,
      headingPath: section.headings.length
        ? section.headings.join(" > ")
        : metadata.title,
      chunkIndex: index,
      content: section.content,
      contentHash,
      fileHash: metadata.fileHash,
      modifiedAt: metadata.modifiedAt,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Parsing
// ─────────────────────────────────────────────────────────────────────────────

function extractFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!text.startsWith("---\n")) {
    return { frontmatter: {}, body: text };
  }

  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  return {
    frontmatter: parseSimpleYaml(match[1]),
    body: text.slice(match[0].length),
  };
}

function parseSimpleYaml(raw: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[match[1]] = value;
  }

  return values;
}

function cleanTitle(
  filePath: string,
  frontmatter: Record<string, string>,
  body: string
): string {
  const frontmatterTitle = frontmatter.title?.trim();
  if (frontmatterTitle) return frontmatterTitle;

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
  const headings: string[] = [];
  const currentLines: string[] = [];
  const headingPattern = /^(#{1,6})\s+(.*\S)\s*$/;

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({ headings: [...headings], content });
    }
    currentLines.length = 0;
  };

  let inCodeBlock = false;

  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const match = headingPattern.exec(line);
      if (match) {
        flush();
        const level = match[1].length;
        const heading = match[2].trim();

        if (level - 1 < headings.length) {
          headings.length = level - 1;
        }

        headings.push(heading);
        currentLines.push(line);
        continue;
      }
    }

    currentLines.push(line);
  }

  flush();

  if (sections.length > 0) {
    return sections;
  }

  const fallback = text.trim();
  return fallback ? [{ headings: [], content: fallback }] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
