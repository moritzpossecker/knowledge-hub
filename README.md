# Markdown to Qdrant ingestion and chat pipeline

This project recursively scans a folder of Markdown files, splits content by Markdown headings, creates embeddings with a local Ollama instance, and upserts the chunks into a shared Qdrant collection. It also includes a local chat flow that retrieves relevant chunks from Qdrant and sends them to an Ollama chat model so you can ask questions against your indexed docs.

The example docs are from [Python Markdown](https://github.com/Python-Markdown/markdown/tree/master).

## Features

- Recursive scan of one source folder.
- Chunking by Markdown headings.
- Deterministic chunk IDs for idempotent re-indexing.
- Configurable Qdrant host and port and Ollama base URL and model names through environment variables.
- Automatic collection creation using the embedding vector size detected from Ollama.
- Optional cleanup of stale chunks for changed files.
- Useful payload fields for later filtering and debugging.
- Collection verification helper script for checking collection status and printing sample points with `--extended`.
- Interactive chat script that performs retrieval-augmented generation against the indexed Markdown collection.
- Separate embedding and chat model configuration, so indexing and answering can use different Ollama models.

## Project structure

- `ingest.py` — main ingestion script.
- `chat_with_docs.py` — interactive terminal chat client for asking questions against indexed docs.
- `collection-check.py` — checks the Qdrant collection, prints collection stats, and can print formatted example points from the payload.
- `.env.example` — configuration template.
- `requirements.txt` — Python dependencies.
- `docker-compose.yml` — local Qdrant + Ollama wiring.

## Requirements

- Python 3.11+.
- A reachable Qdrant instance.
- A reachable Ollama instance with an embedding model already pulled.
- A compatible Ollama chat model already pulled for the chat feature.

Recommended Ollama models for embeddings include `embeddinggemma`, `qwen3-embedding`, and `all-minilm`.

For chat, use a model that your client machine can run reliably with its available RAM and GPU setup. Make sure the selected `OLLAMA_CHAT_MODEL` matches your client hardware compatibility, because a model that is too large for the machine may fail at runtime with Ollama process termination errors.

## Quick start

1. Start Qdrant and Ollama.

```bash
docker compose up -d
```

2. Create a virtual environment and install dependencies.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Copy the environment file and adjust values.

```bash
cp .env.example .env
```

4. Pull your embedding model in Ollama.

```bash
curl http://localhost:11434/api/pull -d '{"model":"embeddinggemma"}'
```

5. Pull a chat model that is compatible with your client machine.

```bash
curl http://localhost:11434/api/pull -d '{"model":"llama3.1"}'
```

If that model is too heavy for the machine you are running on, switch `OLLAMA_CHAT_MODEL` to a smaller compatible model such as `llama3.2:3b`.

6. Run ingestion.

```bash
python3 ingest.py
```

7. Verify the collection.

```bash
python3 collection-check.py
```

Or verify the collection while printing a sample point:

```bash
python3 collection-check.py --extended --limit 1
```

8. Start the chat client.

```bash
python3 chat_with_docs.py
```

Example questions:

```text
What kind of docs do you have access to?
How is the collection created?
What payload fields are stored for each chunk?
```

## Configuration

Environment variables:

- `MARKDOWN_ROOT` — root folder to scan recursively.
- `COLLECTION_NAME` — target Qdrant collection.
- `QDRANT_HOST` — Qdrant hostname.
- `QDRANT_PORT` — Qdrant REST port.
- `QDRANT_API_KEY` — optional API key.
- `QDRANT_USE_HTTPS` — `true` or `false`.
- `OLLAMA_BASE_URL` — Ollama base URL, for example `http://localhost:11434`.
- `OLLAMA_MODEL` — embedding model name used by the ingestion pipeline.
- `EMBED_BATCH_SIZE` — number of chunks embedded per request.
- `UPLOAD_PARALLEL` — Qdrant upload parallelism.
- `QDRANT_BATCH_SIZE` — Qdrant upload batch size.
- `DELETE_MISSING_FILES` — delete points for files that no longer exist.
- `RECREATE_COLLECTION` — delete and recreate collection before indexing.
- `PAYLOAD_INDEX_FIELDS` — comma-separated payload fields to index, for example `document_id,source_path`.
- `OLLAMA_CHAT_MODEL` — Ollama model used for answer generation in the chat client.
- `CHAT_TOP_K` — number of nearest chunks retrieved from Qdrant for each question.
- `CHAT_SCORE_THRESHOLD` — optional minimum similarity threshold for retrieved chunks.
- `CHAT_SYSTEM_PROMPT` — system instruction used by the chat model.

### Example `.env`

```env
MARKDOWN_ROOT=./docs_example
COLLECTION_NAME=markdown_docs
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=
QDRANT_USE_HTTPS=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=embeddinggemma
EMBED_BATCH_SIZE=32
QDRANT_BATCH_SIZE=128
UPLOAD_PARALLEL=2
DELETE_MISSING_FILES=false
RECREATE_COLLECTION=false
PAYLOAD_INDEX_FIELDS=document_id,source_path,file_name

OLLAMA_CHAT_MODEL=llama3.1
CHAT_TOP_K=5
CHAT_SCORE_THRESHOLD=
CHAT_SYSTEM_PROMPT=You are a documentation assistant. Answer only from the provided context. If the answer is not in the context, say clearly that you could not find it in the indexed docs. When useful, cite source paths from the context.
```

## Chat flow

The chat client works as a simple retrieval-augmented generation pipeline:

1. Embed the user question with `OLLAMA_EMBED_MODEL` or, if unset, `OLLAMA_MODEL`.
2. Search Qdrant for the top matching chunks in `COLLECTION_NAME`.
3. Build a context block from the retrieved payload data.
4. Send the question and context to `OLLAMA_CHAT_MODEL` through Ollama's chat API.
5. Return the answer together with the matched source paths and section names.

This means the embedding model used for retrieval should remain compatible with the vectors already stored in Qdrant, while the chat model can be changed independently.

## Data model

Each chunk is stored as one Qdrant point with a vector and optional JSON payload.

Each point contains:

- Deterministic UUID point id.
- Embedding vector from Ollama.
- Payload containing:
  - `document_id`
  - `source_path`
  - `file_name`
  - `title`
  - `headings`
  - `heading_path`
  - `chunk_index`
  - `content`
  - `content_hash`
  - `file_hash`
  - `modified_at`

## Notes

- Collection vector size is inferred from the first Ollama embedding response.
- Cosine distance is used by default.
- The ingestion script deletes all chunks for a document before reinserting that document, which keeps updates simple and prevents stale chunks when headings change.
- The chat feature depends on both retrieval quality and chat-model compatibility. If the chat model is too large for the client machine, Ollama may terminate the process during generation. In that case, keep the embedding model unchanged and switch to a smaller compatible `OLLAMA_CHAT_MODEL`.
- The verification script is intended as a lightweight sanity check; for deeper validation, inspect a few sample payloads and compare the point count against ingestion logs.
