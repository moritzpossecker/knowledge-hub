package kh

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	MarkdownRoot          string
	CollectionName        string
	QdrantBaseURL         string
	QdrantAPIKey          string
	OllamaBaseURL         string
	OllamaModel           string
	OllamaEmbedModel      string
	OllamaChatModel       string
	EmbedBatchSize        int
	QdrantBatchSize       int
	UploadParallel        int
	DeleteMissingFiles    bool
	RecreateCollection    bool
	PayloadIndexFields    []string
	ChatTopK              int
	ChatScoreThreshold    *float32
	ChatScoreThresholdRaw string
	ChatSystemPrompt      string
}

func LoadConfig(path string) (Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("env")
	v.AutomaticEnv()
	setDefaults(v)
	if _, err := os.Stat(path); err == nil {
		if err := v.ReadInConfig(); err != nil {
			return Config{}, err
		}
	}
	cfg := Config{
		MarkdownRoot:          expandPath(v.GetString("MARKDOWN_ROOT")),
		CollectionName:        v.GetString("COLLECTION_NAME"),
		QdrantBaseURL:         strings.TrimRight(v.GetString("QDRANT_BASE_URL"), "/"),
		QdrantAPIKey:          v.GetString("QDRANT_API_KEY"),
		OllamaBaseURL:         strings.TrimRight(v.GetString("OLLAMA_BASE_URL"), "/"),
		OllamaModel:           v.GetString("OLLAMA_MODEL"),
		OllamaEmbedModel:      v.GetString("OLLAMA_EMBED_MODEL"),
		OllamaChatModel:       v.GetString("OLLAMA_CHAT_MODEL"),
		EmbedBatchSize:        v.GetInt("EMBED_BATCH_SIZE"),
		QdrantBatchSize:       v.GetInt("QDRANT_BATCH_SIZE"),
		UploadParallel:        v.GetInt("UPLOAD_PARALLEL"),
		DeleteMissingFiles:    v.GetBool("DELETE_MISSING_FILES"),
		RecreateCollection:    v.GetBool("RECREATE_COLLECTION"),
		PayloadIndexFields:    splitCSV(v.GetString("PAYLOAD_INDEX_FIELDS")),
		ChatTopK:              v.GetInt("CHAT_TOP_K"),
		ChatScoreThresholdRaw: strings.TrimSpace(v.GetString("CHAT_SCORE_THRESHOLD")),
		ChatSystemPrompt:      v.GetString("CHAT_SYSTEM_PROMPT"),
	}
	if cfg.OllamaEmbedModel == "" {
		cfg.OllamaEmbedModel = cfg.OllamaModel
	}
	if cfg.OllamaChatModel == "" {
		cfg.OllamaChatModel = cfg.OllamaModel
	}
	if cfg.ChatScoreThresholdRaw != "" {
		f, err := strconv.ParseFloat(cfg.ChatScoreThresholdRaw, 32)
		if err != nil {
			return Config{}, fmt.Errorf("invalid CHAT_SCORE_THRESHOLD: %w", err)
		}
		ff := float32(f)
		cfg.ChatScoreThreshold = &ff
	}
	return cfg, nil
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("MARKDOWN_ROOT", "./docs")
	v.SetDefault("COLLECTION_NAME", "markdown_docs")
	v.SetDefault("QDRANT_BASE_URL", "http://localhost:6333")
	v.SetDefault("QDRANT_API_KEY", "")
	v.SetDefault("OLLAMA_BASE_URL", "http://localhost:11434")
	v.SetDefault("OLLAMA_MODEL", "embeddinggemma")
	v.SetDefault("OLLAMA_EMBED_MODEL", "embeddinggemma")
	v.SetDefault("OLLAMA_CHAT_MODEL", "llama3.1")
	v.SetDefault("EMBED_BATCH_SIZE", 32)
	v.SetDefault("QDRANT_BATCH_SIZE", 128)
	v.SetDefault("UPLOAD_PARALLEL", 2)
	v.SetDefault("DELETE_MISSING_FILES", false)
	v.SetDefault("RECREATE_COLLECTION", false)
	v.SetDefault("PAYLOAD_INDEX_FIELDS", "document_id,source_path,file_name")
	v.SetDefault("CHAT_TOP_K", 5)
	v.SetDefault("CHAT_SCORE_THRESHOLD", "")
	v.SetDefault("CHAT_SYSTEM_PROMPT", "You are a documentation assistant. Answer only from the provided context. If the answer is not in the context, say clearly that you could not find it in the indexed docs. When useful, cite source paths from the context.")
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func expandPath(s string) string {
	if s == "" {
		return s
	}
	if strings.HasPrefix(s, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Clean(filepath.Join(home, strings.TrimPrefix(s, "~/")))
		}
	}
	abs, err := filepath.Abs(s)
	if err == nil {
		return abs
	}
	return s
}

func WriteEnvFile(path string, values map[string]string) error {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	for _, k := range keys {
		if _, err := fmt.Fprintf(w, "%s=%s\n", k, values[k]); err != nil {
			return err
		}
	}
	return w.Flush()
}
