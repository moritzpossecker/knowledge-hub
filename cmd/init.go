package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/manifoldco/promptui"
	"github.com/moritzpossecker/knowledge-hub-go/internal/kh"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(initCmd)
}

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Interactively create or update .env and optionally start docker compose",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, _ := kh.LoadConfig(".env")
		values := map[string]string{
			"MARKDOWN_ROOT":        cfg.MarkdownRoot,
			"COLLECTION_NAME":      cfg.CollectionName,
			"QDRANT_BASE_URL":      cfg.QdrantBaseURL,
			"QDRANT_GRPC_PORT":     fmt.Sprintf("%d", cfg.QdrantGRPCPort),
			"QDRANT_API_KEY":       cfg.QdrantAPIKey,
			"OLLAMA_BASE_URL":      cfg.OllamaBaseURL,
			"OLLAMA_MODEL":         cfg.OllamaModel,
			"OLLAMA_EMBED_MODEL":   cfg.OllamaEmbedModel,
			"OLLAMA_CHAT_MODEL":    cfg.OllamaChatModel,
			"EMBED_BATCH_SIZE":     fmt.Sprintf("%d", cfg.EmbedBatchSize),
			"QDRANT_BATCH_SIZE":    fmt.Sprintf("%d", cfg.QdrantBatchSize),
			"UPLOAD_PARALLEL":      fmt.Sprintf("%d", cfg.UploadParallel),
			"DELETE_MISSING_FILES": fmt.Sprintf("%t", cfg.DeleteMissingFiles),
			"RECREATE_COLLECTION":  fmt.Sprintf("%t", cfg.RecreateCollection),
			"PAYLOAD_INDEX_FIELDS": strings.Join(cfg.PayloadIndexFields, ","),
			"CHAT_TOP_K":           fmt.Sprintf("%d", cfg.ChatTopK),
			"CHAT_SCORE_THRESHOLD": cfg.ChatScoreThresholdRaw,
			"CHAT_SYSTEM_PROMPT":   cfg.ChatSystemPrompt,
		}

		connectionQuestions := []struct{ key, label string }{
			{"QDRANT_BASE_URL", "Qdrant base URL (where the Qdrant vector database server is reachable or should be created)"},
			{"QDRANT_GRPC_PORT", "Qdrant gRPC port (used for ingest and chat; 6334 is the Docker default)"},
			{"QDRANT_API_KEY", "Qdrant API key (optional, needed by protected instances)"},
			{"OLLAMA_BASE_URL", "Ollama URL (where the Ollama server is reachable or should be created)"},
		}
		uiNote(cmd.OutOrStdout(), "Connection setup — press Enter to keep a suggested value.")
		for _, q := range connectionQuestions {
			prompt := promptui.Prompt{Label: q.label, Default: values[q.key], AllowEdit: true}
			res, err := prompt.Run()
			if err != nil {
				return err
			}
			values[q.key] = strings.TrimSpace(res)
		}
		_, qdrantPort, _, err := kh.ParseQdrantURL(values["QDRANT_BASE_URL"])
		if err != nil {
			return err
		}
		if _, err := kh.QdrantGRPCAddress(values["QDRANT_BASE_URL"], values["QDRANT_GRPC_PORT"]); err != nil {
			return err
		}

		qdrantHealthURL := kh.QdrantHealthURL(values["QDRANT_BASE_URL"])
		ollamaHealthURL := strings.TrimRight(values["OLLAMA_BASE_URL"], "/") + "/api/tags"
		qdrantUp := kh.IsHTTPHealthy(qdrantHealthURL)
		ollamaUp := kh.IsHTTPHealthy(ollamaHealthURL)
		localUnavailable := false
		if !qdrantUp {
			if kh.IsLocalhost(values["QDRANT_BASE_URL"]) {
				fmt.Fprintf(cmd.OutOrStdout(), "Qdrant is not reachable at %s.\n", values["QDRANT_BASE_URL"])
				localUnavailable = true
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "Qdrant is not reachable at %s yet. Start that remote instance, then continue.\n", values["QDRANT_BASE_URL"])
			}
		}
		if !ollamaUp {
			if kh.IsLocalhost(values["OLLAMA_BASE_URL"]) {
				fmt.Fprintf(cmd.OutOrStdout(), "Ollama is not reachable at %s.\n", values["OLLAMA_BASE_URL"])
				localUnavailable = true
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "Ollama is not reachable at %s yet. Start that remote instance, then continue.\n", values["OLLAMA_BASE_URL"])
			}
		}
		if localUnavailable {
			confirm := promptui.Select{Label: "Start the local Docker Compose services now?", Items: []string{"Yes", "No"}}
			_, choice, err := confirm.Run()
			if err != nil {
				return err
			}
			if choice == "Yes" {
				composePath := "docker-compose.yml"
				if _, err := os.Stat(composePath); err != nil {
					return fmt.Errorf("docker-compose.yml not found: %w", err)
				}
				ollamaPort, err := kh.URLPort(values["OLLAMA_BASE_URL"], "11434")
				if err != nil {
					return err
				}
				if err := kh.RunComposeUp(composePath, qdrantPort, values["QDRANT_GRPC_PORT"], ollamaPort); err != nil {
					return err
				}
			}
		}

		questions := []struct{ key, label string }{
			{"MARKDOWN_ROOT", "Dokumentationspfad"},
			{"COLLECTION_NAME", "Collection name (where indexed document vectors are stored)"},
			{"OLLAMA_MODEL", "Embedding-Modell für Ingest"},
			{"OLLAMA_EMBED_MODEL", "Embedding-Modell für Chat-Retrieval"},
			{"OLLAMA_CHAT_MODEL", "Chat-Modell"},
			{"EMBED_BATCH_SIZE", "Embedding batch size (texts embedded per Ollama request; increase for speed if memory allows)"},
			{"QDRANT_BATCH_SIZE", "Qdrant Batch Size"},
			{"UPLOAD_PARALLEL", "Upload Parallel"},
			{"DELETE_MISSING_FILES", "Delete missing files (true removes vectors whose source files are no longer indexed)"},
			{"RECREATE_COLLECTION", "Collection neu erstellen (true/false)"},
			{"PAYLOAD_INDEX_FIELDS", "Payload-Index-Felder (csv)"},
			{"CHAT_TOP_K", "Chat top-K (number of relevant document chunks passed to the chat model)"},
			{"CHAT_SCORE_THRESHOLD", "Chat score threshold (optional; omit to accept every retrieved chunk, or set a minimum similarity score)"},
			{"CHAT_SYSTEM_PROMPT", "Chat system prompt (instructions that constrain how answers use the retrieved context)"},
		}
		uiNote(cmd.OutOrStdout(), "Index and chat settings")

		for _, q := range questions {
			prompt := promptui.Prompt{Label: q.label, Default: values[q.key], AllowEdit: true}
			res, err := prompt.Run()
			if err != nil {
				return err
			}
			values[q.key] = strings.TrimSpace(res)
		}

		if err := kh.WriteEnvFile(".env", values); err != nil {
			return err
		}
		uiSuccess(cmd.OutOrStdout(), "Saved configuration to .env")

		missing, err := kh.OllamaMissingModels(values["OLLAMA_BASE_URL"], []string{values["OLLAMA_MODEL"], values["OLLAMA_EMBED_MODEL"], values["OLLAMA_CHAT_MODEL"]})
		if err != nil {
			fmt.Fprintf(cmd.OutOrStdout(), "Could not check selected Ollama models: %v\n", err)
			return nil
		}
		if len(missing) == 0 {
			uiSuccess(cmd.OutOrStdout(), "All selected Ollama models are installed.")
			return nil
		}
		confirm := promptui.Select{Label: fmt.Sprintf("Missing Ollama models: %s. Install them automatically?", strings.Join(missing, ", ")), Items: []string{"Yes", "No"}}
		_, choice, err := confirm.Run()
		if err != nil {
			return err
		}
		if choice == "Yes" {
			for _, model := range missing {
				fmt.Fprintf(cmd.OutOrStdout(), "Installing Ollama model %s...\n", model)
				if err := kh.PullOllamaModel(values["OLLAMA_BASE_URL"], model); err != nil {
					return err
				}
			}
			uiSuccess(cmd.OutOrStdout(), "Selected Ollama models installed.")
		}
		return nil
	},
}
