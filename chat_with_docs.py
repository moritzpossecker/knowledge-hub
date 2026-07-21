from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient, models

load_dotenv()


@dataclass
class ChatConfig:
    collection_name: str
    qdrant_host: str
    qdrant_port: int
    qdrant_api_key: str | None
    qdrant_use_https: bool
    ollama_base_url: str
    ollama_model: str
    ollama_embed_model: str
    top_k: int
    score_threshold: float | None
    system_prompt: str


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_config() -> ChatConfig:
    return ChatConfig(
        collection_name=os.getenv("COLLECTION_NAME", "markdown_docs"),
        qdrant_host=os.getenv("QDRANT_HOST", "localhost"),
        qdrant_port=int(os.getenv("QDRANT_PORT", "6333")),
        qdrant_api_key=os.getenv("QDRANT_API_KEY") or None,
        qdrant_use_https=env_bool("QDRANT_USE_HTTPS", False),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"),
        ollama_model=os.getenv("OLLAMA_CHAT_MODEL", os.getenv("OLLAMA_MODEL", "llama3.1")),
        ollama_embed_model=os.getenv("OLLAMA_EMBED_MODEL", os.getenv("OLLAMA_MODEL", "embeddinggemma")),
        top_k=int(os.getenv("CHAT_TOP_K", "5")),
        score_threshold=float(os.getenv("CHAT_SCORE_THRESHOLD")) if os.getenv("CHAT_SCORE_THRESHOLD") else None,
        system_prompt=os.getenv(
            "CHAT_SYSTEM_PROMPT",
            "You are a documentation assistant. Answer only from the provided context. "
            "If the answer is not in the context, say clearly that you could not find it in the indexed docs. "
            "When useful, cite source paths from the context.",
        ),
    )


def get_qdrant_client(config: ChatConfig) -> QdrantClient:
    return QdrantClient(
        host=config.qdrant_host,
        port=config.qdrant_port,
        https=config.qdrant_use_https,
        api_key=config.qdrant_api_key,
        timeout=300,
    )


def ollama_embed(base_url: str, model: str, text: str) -> list[float]:
    response = requests.post(
        f"{base_url}/api/embed",
        json={"model": model, "input": [text]},
        timeout=300,
    )
    response.raise_for_status()
    data = response.json()
    embeddings = data.get("embeddings")
    if not embeddings:
        raise RuntimeError("Ollama returned no embeddings")
    return embeddings[0]


def qdrant_search(client: QdrantClient, config: ChatConfig, query: str) -> list[Any]:
    vector = ollama_embed(config.ollama_base_url, config.ollama_embed_model, query)
    return client.query_points(
        collection_name=config.collection_name,
        query=vector,
        limit=config.top_k,
        score_threshold=config.score_threshold,
        with_payload=True,
        with_vectors=False,
    ).points


def build_context(points: list[Any]) -> str:
    blocks: list[str] = []
    for i, point in enumerate(points, start=1):
        payload = point.payload or {}
        source_path = payload.get("source_path", "unknown")
        heading_path = payload.get("heading_path", "unknown")
        content = payload.get("content", "")
        score = getattr(point, "score", None)
        blocks.append(
            f"[Source {i}]\n"
            f"path: {source_path}\n"
            f"section: {heading_path}\n"
            f"score: {score}\n"
            f"content:\n{content}"
        )
    return "\n\n".join(blocks)


def ollama_chat(base_url: str, model: str, system_prompt: str, question: str, context: str) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Use the following retrieved documentation context to answer the question.\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {question}"
            ),
        },
    ]
    response = requests.post(
        f"{base_url}/api/chat",
        json={"model": model, "messages": messages, "stream": False},
        timeout=300,
    )
    response.raise_for_status()
    data = response.json()
    message = data.get("message") or {}
    content = message.get("content")
    if not content:
        raise RuntimeError("Ollama returned no chat content")
    return content.strip()


def format_sources(points: list[Any]) -> str:
    lines: list[str] = []
    for i, point in enumerate(points, start=1):
        payload = point.payload or {}
        lines.append(
            f"{i}. {payload.get('source_path', 'unknown')}"
            f" :: {payload.get('heading_path', 'unknown')}"
            f" (score={getattr(point, 'score', None)})"
        )
    return "\n".join(lines)


def answer_question(client: QdrantClient, config: ChatConfig, question: str) -> str:
    points = qdrant_search(client, config, question)
    if not points:
        return "I could not find relevant passages in the indexed docs."

    context = build_context(points)
    answer = ollama_chat(config.ollama_base_url, config.ollama_model, config.system_prompt, question, context)
    return f"{answer}\n\nSources:\n{format_sources(points)}"


def repl() -> None:
    config = load_config()
    client = get_qdrant_client(config)

    print(f"Connected to Qdrant collection '{config.collection_name}'.")
    print(f"Using chat model '{config.ollama_model}' and embedding model '{config.ollama_embed_model}'.")
    print("Type a question, or 'exit' to quit.\n")

    while True:
        try:
            question = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question:
            continue
        if question.lower() in {"exit", "quit", ":q"}:
            break

        try:
            print()
            print(answer_question(client, config, question))
            print()
        except requests.HTTPError as exc:
            print(f"HTTP error: {exc}")
            try:
                print(exc.response.text)
            except Exception:
                pass
            print()
        except Exception as exc:
            print(f"Error: {exc}\n")


if __name__ == "__main__":
    repl()
