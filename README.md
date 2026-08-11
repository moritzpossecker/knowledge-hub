# Knowledge Hub TypeScript CLI

Diese TypeScript-CLI setzt die gewünschten Kommandos mit Commander um:

- `config` — fragt `config.json` interaktiv ab. Qdrant wird als `qdrantBaseUrl` plus `qdrantGrpcPort` gespeichert. Bei nicht erreichbaren lokalen Diensten kann es Docker Compose mit den gewählten HTTP-, gRPC- und Ollama-Host-Ports starten. Für entfernte Dienste wird nur auf den ausstehenden Start hingewiesen. Außerdem prüft es die gewählten Ollama-Modelle und kann fehlende Modelle installieren.
- `ingest [path-or-git-url]` — indexiert Markdown-Dateien oder temporär geklonte Git-Repositories in Qdrant und führt danach automatisch einen Collection-Check aus.
- `chat` — startet einen interaktiven Terminal-Chat gegen die indexierten Dokumente.
- `web` — startet eine lokale Web-UI (Next.js) mit persistierten Chat-Sessions. Antworten zeigen anklickbare Quellen, die die zugehörigen Markdown-Inhalte (aus den Qdrant-Chunks rekonstruiert) in einer Seitenleiste anzeigen.

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
node dist/src/cli.js web
```

Die Web-UI läuft standardmäßig unter `http://localhost:3000` (`--port` zum Ändern) und startet `next dev` im `web/`-Workspace. Für einen Produktions-Build vorher `npm run web:build` ausführen und dann `knowledge-hub web --prod`. Chat-Sessions werden lokal in `.knowledge-hub/chat.db` (SQLite) gespeichert.

Während der Entwicklung geht auch:

```bash
npm run build
npm test
```

## Hinweise

- Die TypeScript-Version nutzt Qdrants HTTP API über `qdrantBaseUrl`; `qdrantGrpcPort` bleibt in `config.json`, damit `config` die Docker-Compose-Portbelegung weiter abfragen und setzen kann.
- `ingest` akzeptiert sowohl einen lokalen Pfad als auch eine Git-URL. Git-Repos werden temporär geklont.
- `chat` speichert keine Historie persistent.
