# Knowledge Hub

[Deutsch](README.de.md) | **English**

An LLM-driven documentation management and retrieval system with interactive CLI and Next.js Web UI powered by Ollama and Qdrant.

## Features

- **Multi-Source Ingestion**: Ingests Markdown files from local paths or remote Git repositories (cloned temporarily).
- **Vector Search & Grounding**: Chunks and indexes documentation into Qdrant for semantic search and retrieval-augmented generation (RAG).
- **Service & Model Auto-Check**: Validates local Qdrant and Ollama connectivity (with optional Docker Compose orchestration) and pulls missing Ollama models.
- **Terminal Chat**: Interactive CLI chat session grounded in indexed documents.
- **Next.js Web UI**: Full web interface featuring chat history persistence (via SQLite) and expandable source citations with reconstructed Markdown chunk views.

## Commands

- `config` — Interactively configures `config.json` (`qdrantBaseUrl`, `qdrantGrpcPort`, `ollamaBaseUrl`, models, etc.). If local services are unreachable, prompts to start Docker Compose. Verifies required Ollama models and installs missing ones.
- `ingest [path-or-git-url]` — Indexes Markdown files or temporarily cloned Git repositories into Qdrant, followed by an automatic collection verification check.
- `chat` — Starts an interactive terminal chat session grounded on the indexed documents.
- `web` — Starts the local Next.js web UI with persistent chat sessions. Responses include interactive source links that display reconstructed Markdown chunk contents in a dedicated sidebar. Supports `--prod` mode and Docker container execution (`ghcr.io/moritzpossecker/knowledge-hub:latest`).

## Setup and Installation

Install dependencies and build the workspace:

```bash
npm install
npm run build
```

Run CLI commands locally:

```bash
node dist/src/cli.js config
node dist/src/cli.js ingest ./docs_example
node dist/src/cli.js chat
node dist/src/cli.js web
```

## Web Interface

The web interface runs by default at `http://localhost:3000` (customizable via `--port`).

For production builds:

```bash
npm run web:build
node dist/src/cli.js web --prod
```

Chat sessions and history are stored locally in an SQLite database at `.knowledge-hub/chat.db`.

## Development Workflow

```bash
npm run build
npm test
```

## Technical Notes

- **Qdrant Integration**: Uses the Qdrant HTTP REST API via `qdrantBaseUrl`. `qdrantGrpcPort` is maintained in `config.json` to configure Docker Compose port bindings.
- **Git Ingestion**: Supports remote Git repository URLs directly in `ingest`; repositories are cloned into a temporary directory during ingestion.
- **Architecture**: Modular monorepo structuring core utilities (`@knowledge-hub/core`), CLI commands (`cli`), and the frontend (`web`).
