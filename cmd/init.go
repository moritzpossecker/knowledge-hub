package cmd

import (
	"fmt"
	"os"
	"strconv"
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
			"QDRANT_HOST":          cfg.QdrantHost,
			"QDRANT_PORT":          fmt.Sprintf("%d", cfg.QdrantPort),
			"QDRANT_API_KEY":       cfg.QdrantAPIKey,
			"QDRANT_USE_HTTPS":     fmt.Sprintf("%t", cfg.QdrantUseHTTPS),
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

		qdrantURL := kh.BuildQdrantURL(values["QDRANT_USE_HTTPS"], values["QDRANT_HOST"], values["QDRANT_PORT"])
		qdrantURL = strings.TrimSuffix(qdrantURL, "/collections")
		connectionQuestions := []struct{ key, label string }{
			{"QDRANT_URL", "Qdrant URL (for example http://localhost:6333)"},
			{"QDRANT_API_KEY", "Qdrant API key (optional; needed by protected instances)"},
			{"OLLAMA_BASE_URL", "Ollama URL (for example http://localhost:11434)"},
		}
		values["QDRANT_URL"] = qdrantURL
		for _, q := range connectionQuestions {
			prompt := promptui.Prompt{Label: q.label, Default: values[q.key], AllowEdit: true}
			res, err := prompt.Run()
			if err != nil {
				return err
			}
			values[q.key] = strings.TrimSpace(res)
		}
		host, port, useHTTPS, err := kh.ParseQdrantURL(values["QDRANT_URL"])
		if err != nil {
			return err
		}
		values["QDRANT_HOST"] = host
		values["QDRANT_PORT"] = port
		values["QDRANT_USE_HTTPS"] = strconv.FormatBool(useHTTPS)

		qdrantHealthURL := kh.BuildQdrantURL(values["QDRANT_USE_HTTPS"], values["QDRANT_HOST"], values["QDRANT_PORT"])
		ollamaHealthURL := strings.TrimRight(values["OLLAMA_BASE_URL"], "/") + "/api/tags"
		qdrantUp := kh.IsHTTPHealthy(qdrantHealthURL)
		ollamaUp := kh.IsHTTPHealthy(ollamaHealthURL)
		localUnavailable := false
		if !qdrantUp {
			if kh.IsLocalhost(values["QDRANT_URL"]) {
				fmt.Fprintf(cmd.OutOrStdout(), "Qdrant is not reachable at %s. The local container should listen on port %s.\n", values["QDRANT_URL"], values["QDRANT_PORT"])
				localUnavailable = true
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "Qdrant is not reachable at %s yet. Start that remote instance, then continue.\n", values["QDRANT_URL"])
			}
		}
		if !ollamaUp {
			if kh.IsLocalhost(values["OLLAMA_BASE_URL"]) {
				fmt.Fprintf(cmd.OutOrStdout(), "Ollama is not reachable at %s. The local container should listen on port 11434.\n", values["OLLAMA_BASE_URL"])
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
				if err := kh.RunComposeUp(composePath); err != nil {
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

		for _, q := range questions {
			prompt := promptui.Prompt{Label: q.label, Default: values[q.key], AllowEdit: true}
			res, err := prompt.Run()
			if err != nil {
				return err
			}
			values[q.key] = strings.TrimSpace(res)
		}

		// QDRANT_URL is an interactive convenience; retain the established
		// decomposed settings in .env for the rest of the application.
		delete(values, "QDRANT_URL")
		if err := kh.WriteEnvFile(".env", values); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "✅ .env geschrieben")

		missing, err := kh.OllamaMissingModels(values["OLLAMA_BASE_URL"], []string{values["OLLAMA_MODEL"], values["OLLAMA_EMBED_MODEL"], values["OLLAMA_CHAT_MODEL"]})
		if err != nil {
			fmt.Fprintf(cmd.OutOrStdout(), "Could not check selected Ollama models: %v\n", err)
			return nil
		}
		if len(missing) == 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "All selected Ollama models are installed.")
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
			fmt.Fprintln(cmd.OutOrStdout(), "Selected Ollama models installed.")
		}
		return nil
	},
}
