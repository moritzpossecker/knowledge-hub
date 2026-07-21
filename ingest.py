from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import yaml
from dotenv import load_dotenv
from qdrant_client import QdrantClient, models


load_dotenv()


@dataclass
class Config:
    markdown_root: Path
    collection_name: str
    qdrant_host: str
    qdrant_port: int
    qdrant_api_key: str | None
    qdrant_use_https: bool
    ollama_base_url: str
    ollama_model: str
    embed_batch_size: int
    qdrant_batch_size: int
    upload_parallel: int
    delete_missing_files: bool
    recreate_collection: bool
    payload_index_fields: list[str]


@dataclass
class Chunk:
    point_id: str
    document_id: str
    source_path: str
    file_name: str
    title: str
    headings: list[str]
    heading_path: str
    chunk_index: int
    content: str
    content_hash: str
    file_hash: str
    modified_at: str


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def load_config() -> Config:
    root = Path(os.getenv("MARKDOWN_ROOT", "./docs")).expanduser().resolve()
    return Config(
        markdown_root=root,
        collection_name=os.getenv("COLLECTION_NAME", "markdown_docs"),
        qdrant_host=os.getenv("QDRANT_HOST", "localhost"),
        qdrant_port=int(os.getenv("QDRANT_PORT", "6333")),
        qdrant_api_key=os.getenv("QDRANT_API_KEY") or None,
        qdrant_use_https=env_bool("QDRANT_USE_HTTPS", False),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"),
        ollama_model=os.getenv("OLLAMA_MODEL", "embeddinggemma"),
        embed_batch_size=int(os.getenv("EMBED_BATCH_SIZE", "32")),
        qdrant_batch_size=int(os.getenv("QDRANT_BATCH_SIZE", "128")),
        upload_parallel=int(os.getenv("UPLOAD_PARALLEL", "2")),
        delete_missing_files=env_bool("DELETE_MISSING_FILES", False),
        recreate_collection=env_bool("RECREATE_COLLECTION", False),
        payload_index_fields=env_list("PAYLOAD_INDEX_FIELDS"),
    )


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def uuid5_str(namespace: uuid.UUID, value: str) -> str:
    return str(uuid.uuid5(namespace, value))


def extract_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    match = re.match(r"^---\n(.*?)\n---\n?", text, flags=re.DOTALL)
    if not match:
        return {}, text
    raw = match.group(1)
    body = text[match.end():]
    try:
        data = yaml.safe_load(raw) or {}
        if not isinstance(data, dict):
            data = {}
        return data, body
    except Exception:
        return {}, body


def clean_title(path: Path, frontmatter: dict[str, Any], body: str) -> str:
    if isinstance(frontmatter.get("title"), str) and frontmatter["title"].strip():
        return frontmatter["title"].strip()
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").replace("_", " ").strip()


def split_markdown_by_headings(text: str) -> list[tuple[list[str], str]]:
    lines = text.splitlines()
    sections: list[tuple[list[str], list[str]]] = []
    current_headings: list[str] = []
    current_lines: list[str] = []

    heading_pattern = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")

    def flush() -> None:
        nonlocal current_lines
        content = "\n".join(current_lines).strip()
        if content:
            sections.append((current_headings.copy(), current_lines.copy()))
        current_lines = []

    for line in lines:
        match = heading_pattern.match(line)
        if match:
            flush()
            level = len(match.group(1))
            heading_text = match.group(2).strip()
            current_headings[:] = current_headings[: level - 1]
            current_headings.append(heading_text)
            current_lines = [line]
        else:
            current_lines.append(line)

    flush()

    normalized: list[tuple[list[str], str]] = []
    for headings, chunk_lines in sections:
        content = "\n".join(chunk_lines).strip()
        if content:
            normalized.append((headings, content))

    if normalized:
        return normalized

    fallback = text.strip()
    return [([], fallback)] if fallback else []


def build_chunks(root: Path, file_path: Path) -> list[Chunk]:
    raw_text = file_path.read_text(encoding="utf-8")
    stat = file_path.stat()
    modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
    frontmatter, body = extract_frontmatter(raw_text)
    title = clean_title(file_path, frontmatter, body)
    file_hash = sha256_text(raw_text)
    relative_path = file_path.relative_to(root).as_posix()
    document_id = uuid5_str(uuid.NAMESPACE_URL, relative_path)

    chunks: list[Chunk] = []
    for chunk_index, (headings, content) in enumerate(split_markdown_by_headings(body)):
        content_hash = sha256_text(content)
        point_id = uuid5_str(uuid.NAMESPACE_OID, f"{relative_path}:{chunk_index}:{content_hash}")
        chunks.append(
            Chunk(
                point_id=point_id,
                document_id=document_id,
                source_path=relative_path,
                file_name=file_path.name,
                title=title,
                headings=headings,
                heading_path=" > ".join(headings) if headings else title,
                chunk_index=chunk_index,
                content=content,
                content_hash=content_hash,
                file_hash=file_hash,
                modified_at=modified_at,
            )
        )
    return chunks


def iter_markdown_files(root: Path) -> list[Path]:
    exts = {".md", ".markdown", ".mdown", ".mkd"}
    return sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in exts)


def ollama_embed(base_url: str, model: str, texts: list[str]) -> list[list[float]]:
    response = requests.post(
        f"{base_url}/api/embed",
        json={"model": model, "input": texts},
        timeout=300,
    )
    response.raise_for_status()
    data = response.json()
    embeddings = data.get("embeddings")
    if not embeddings:
        raise RuntimeError("Ollama returned no embeddings")
    return embeddings


def infer_vector_size(config: Config) -> int:
    emb = ollama_embed(config.ollama_base_url, config.ollama_model, ["vector size probe"])
    return len(emb[0])


def get_qdrant_client(config: Config) -> QdrantClient:
    return QdrantClient(
        host=config.qdrant_host,
        port=config.qdrant_port,
        https=config.qdrant_use_https,
        api_key=config.qdrant_api_key,
        timeout=300,
    )


def ensure_collection(client: QdrantClient, config: Config, vector_size: int) -> None:
    if config.recreate_collection and client.collection_exists(config.collection_name):
        client.delete_collection(config.collection_name)

    if not client.collection_exists(config.collection_name):
        client.create_collection(
            collection_name=config.collection_name,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )

    for field in config.payload_index_fields:
        try:
            client.create_payload_index(
                collection_name=config.collection_name,
                field_name=field,
                field_schema=models.PayloadSchemaType.KEYWORD,
                wait=True,
            )
        except Exception:
            pass


def batch_list(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def delete_document_points(client: QdrantClient, collection_name: str, document_id: str) -> None:
    client.delete(
        collection_name=collection_name,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    )
                ]
            )
        ),
        wait=True,
    )


def delete_missing_documents(client: QdrantClient, config: Config, existing_document_ids: set[str]) -> None:
    offset = None
    stale_ids: set[str] = set()
    while True:
        records, offset = client.scroll(
            collection_name=config.collection_name,
            scroll_filter=None,
            with_payload=["document_id"],
            with_vectors=False,
            limit=256,
            offset=offset,
        )
        for record in records:
            payload = record.payload or {}
            doc_id = payload.get("document_id")
            if isinstance(doc_id, str) and doc_id not in existing_document_ids:
                stale_ids.add(doc_id)
        if offset is None:
            break

    for doc_id in stale_ids:
        delete_document_points(client, config.collection_name, doc_id)


def upsert_chunks(client: QdrantClient, config: Config, chunks: list[Chunk]) -> None:
    texts = [chunk.content for chunk in chunks]
    vectors: list[list[float]] = []
    for text_batch in batch_list(texts, config.embed_batch_size):
        vectors.extend(ollama_embed(config.ollama_base_url, config.ollama_model, text_batch))

    points: list[models.PointStruct] = []
    for chunk, vector in zip(chunks, vectors, strict=True):
        payload = {
            "document_id": chunk.document_id,
            "source_path": chunk.source_path,
            "file_name": chunk.file_name,
            "title": chunk.title,
            "headings": chunk.headings,
            "heading_path": chunk.heading_path,
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
            "content_hash": chunk.content_hash,
            "file_hash": chunk.file_hash,
            "modified_at": chunk.modified_at,
        }
        points.append(models.PointStruct(id=chunk.point_id, vector=vector, payload=payload))

    client.upload_points(
        collection_name=config.collection_name,
        points=points,
        batch_size=config.qdrant_batch_size,
        parallel=config.upload_parallel,
        max_retries=3,
        wait=True,
    )


def main() -> None:
    config = load_config()
    if not config.markdown_root.exists() or not config.markdown_root.is_dir():
        raise SystemExit(f"MARKDOWN_ROOT does not exist or is not a directory: {config.markdown_root}")

    files = iter_markdown_files(config.markdown_root)
    if not files:
        raise SystemExit(f"No markdown files found under: {config.markdown_root}")

    client = get_qdrant_client(config)
    vector_size = infer_vector_size(config)
    ensure_collection(client, config, vector_size)

    current_document_ids: set[str] = set()
    total_chunks = 0

    for file_path in files:
        chunks = build_chunks(config.markdown_root, file_path)
        if not chunks:
            continue
        document_id = chunks[0].document_id
        current_document_ids.add(document_id)
        delete_document_points(client, config.collection_name, document_id)
        upsert_chunks(client, config, chunks)
        total_chunks += len(chunks)
        print(f"Indexed {file_path.relative_to(config.markdown_root)} -> {len(chunks)} chunks")

    if config.delete_missing_files:
        delete_missing_documents(client, config, current_document_ids)

    print(f"Done. Indexed {len(current_document_ids)} documents and {total_chunks} chunks into '{config.collection_name}'.")


if __name__ == "__main__":
    main()
