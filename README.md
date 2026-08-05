# Knowledge Hub Go CLI

Diese Go-CLI setzt die gewünschten Kommandos um:

- `init` — fragt `.env` interaktiv ab. Qdrant wird als `QDRANT_BASE_URL` gespeichert. Bei nicht erreichbaren lokalen Diensten kann es Docker Compose mit den in den Qdrant- und Ollama-URLs gewählten Host-Ports starten. Für entfernte Dienste wird nur auf den ausstehenden Start hingewiesen. Außerdem prüft es die gewählten Ollama-Modelle und kann fehlende Modelle installieren.
- `ingest [path-or-git-url]` — portiert die Ingest-Logik aus `ingest.py` und führt danach automatisch einen Collection-Check aus.
- `chat` — portiert die Logik aus `chat_with_docs.py` als interaktiven Terminal-Chat.

## Build

```bash
go mod tidy
go build -o knowledge-hub
```

## Hinweise

- Für Qdrant wird hier der gRPC-Port `6334` verwendet; der bestehende Docker-Compose des Python-Repos exponiert standardmäßig nur `6333`, daher sollte das Compose-File um `6334:6334` ergänzt werden.
- `ingest` akzeptiert sowohl einen lokalen Pfad als auch eine Git-URL. Git-Repos werden temporär geklont.
- `chat` speichert keine Historie persistent.
