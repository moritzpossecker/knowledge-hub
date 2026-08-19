# Knowledge Hub

**Deutsch** | [English](README.md)

Ein LLM-basiertes System zur Verwaltung und Suche in Dokumentationen mit interaktiver CLI und Next.js-Web-UI, betrieben mit Ollama und Qdrant.

## Funktionen

- **Aufnahme aus mehreren Quellen**: Nimmt Markdown-Dateien aus lokalen Pfaden oder entfernten Git-Repositories auf (temporär geklont).
- **Vektorsuche und Grounding**: Teilt Dokumentationen in Chunks auf und indexiert sie für semantische Suche und Retrieval-Augmented Generation (RAG) in Qdrant.
- **Automatische Prüfung von Diensten und Modellen**: Prüft die Verbindung zu lokalen Qdrant- und Ollama-Diensten (optional mit Docker-Compose-Orchestrierung) und lädt fehlende Ollama-Modelle herunter.
- **Terminal-Chat**: Interaktive CLI-Chat-Sitzung auf Basis der indexierten Dokumente.
- **Next.js-Web-UI**: Vollständige Weboberfläche mit persistiertem Chat-Verlauf (über SQLite) und aufklappbaren Quellenangaben mit rekonstruierten Markdown-Chunk-Ansichten.

## Befehle

- `config` — Konfiguriert `config.json` interaktiv (`qdrantBaseUrl`, `qdrantGrpcPort`, `ollamaBaseUrl`, Modelle usw.). Wenn lokale Dienste nicht erreichbar sind, wird zum Start von Docker Compose aufgefordert. Die benötigten Ollama-Modelle werden geprüft und fehlende Modelle installiert.
- `ingest [path-or-git-url]` — Indexiert Markdown-Dateien oder temporär geklonte Git-Repositories in Qdrant und führt anschließend automatisch eine Collection-Prüfung durch.
- `chat` — Startet eine interaktive Terminal-Chat-Sitzung auf Basis der indexierten Dokumente.
- `web` — Startet die lokale Next.js-Web-UI mit persistenten Chat-Sitzungen. Antworten enthalten interaktive Quellenlinks, die rekonstruierte Markdown-Chunk-Inhalte in einer eigenen Seitenleiste anzeigen. Unterstützt den `--prod`-Modus und die Ausführung in einem Docker-Container (`ghcr.io/moritzpossecker/knowledge-hub:latest`).

## Einrichtung und Installation

Abhängigkeiten installieren und den Workspace bauen:

```bash
npm install
npm run build
```

CLI-Befehle lokal ausführen:

```bash
node dist/src/cli.js config
node dist/src/cli.js ingest ./docs_example
node dist/src/cli.js chat
node dist/src/cli.js web
```

## Weboberfläche

Die Weboberfläche läuft standardmäßig unter `http://localhost:3000` (über `--port` anpassbar).

Für Produktions-Builds:

```bash
npm run web:build
node dist/src/cli.js web --prod
```

Chat-Sitzungen und Verlauf werden lokal in einer SQLite-Datenbank unter `.knowledge-hub/chat.db` gespeichert.

## Entwicklungsablauf

```bash
npm run build
npm test
```

## Technische Hinweise

- **Qdrant-Integration**: Verwendet die HTTP-REST-API von Qdrant über `qdrantBaseUrl`. `qdrantGrpcPort` wird in `config.json` beibehalten, um die Docker-Compose-Portbindungen zu konfigurieren.
- **Git-Aufnahme**: Unterstützt entfernte Git-Repository-URLs direkt in `ingest`; Repositories werden während der Aufnahme in ein temporäres Verzeichnis geklont.
- **Architektur**: Ein modularer Monorepo-Aufbau strukturiert die Core-Hilfsfunktionen (`@knowledge-hub/core`), CLI-Befehle (`cli`) und das Frontend (`web`).

