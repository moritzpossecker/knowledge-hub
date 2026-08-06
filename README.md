# Knowledge Hub TypeScript CLI

Diese TypeScript-CLI setzt die gewünschten Kommandos mit Commander um:

- `config` — fragt `config.json` interaktiv ab. Qdrant wird als `qdrantBaseUrl` plus `qdrantGrpcPort` gespeichert. Bei nicht erreichbaren lokalen Diensten kann es Docker Compose mit den gewählten HTTP-, gRPC- und Ollama-Host-Ports starten. Für entfernte Dienste wird nur auf den ausstehenden Start hingewiesen. Außerdem prüft es die gewählten Ollama-Modelle und kann fehlende Modelle installieren.
- `ingest [path-or-git-url]` — indexiert Markdown-Dateien oder temporär geklonte Git-Repositories in Qdrant und führt danach automatisch einen Collection-Check aus.
- `chat` — startet einen interaktiven Terminal-Chat gegen die indexierten Dokumente.

## Setup

```bash
npm install
npm run build
```

Danach kann die CLI lokal so gestartet werden:

```bash
node dist/src/cli.js config
node dist/src/cli.js ingest ./docs_example
node dist/src/cli.js chat
```

Während der Entwicklung geht auch:

```bash
npm run build
npm test
```

## Hinweise

- Die TypeScript-Version nutzt Qdrants HTTP API über `qdrantBaseUrl`; `qdrantGrpcPort` bleibt in `config.json`, damit `config` die Docker-Compose-Portbelegung weiter abfragen und setzen kann.
- `ingest` akzeptiert sowohl einen lokalen Pfad als auch eine Git-URL. Git-Repos werden temporär geklont.
- `chat` speichert keine Historie persistent.
