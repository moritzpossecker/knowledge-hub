package kh

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	qdrant "github.com/qdrant/go-client/qdrant"
)

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatResponse struct {
	Message struct {
		Content string `json:"content"`
	} `json:"message"`
}

func RunChat(cfg Config, in io.Reader, out io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	qs, conn, err := newQdrantService(ctx, cfg)
	if err != nil {
		return err
	}
	defer conn.Close()

	scanner := bufio.NewScanner(in)
	fmt.Fprintln(out, "Chat gestartet. Beenden mit 'exit' oder 'quit'.")
	for {
		fmt.Fprint(out, "> ")
		if !scanner.Scan() {
			return scanner.Err()
		}
		question := strings.TrimSpace(scanner.Text())
		if question == "" {
			continue
		}
		lower := strings.ToLower(question)
		if lower == "exit" || lower == "quit" {
			fmt.Fprintln(out, "Bye.")
			return nil
		}
		answer, sources, err := askQuestion(ctx, qs, cfg, question)
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "\n%s\n\n", answer)
		if len(sources) > 0 {
			fmt.Fprintln(out, "Quellen:")
			for _, s := range sources {
				fmt.Fprintf(out, "- %s\n", s)
			}
			fmt.Fprintln(out)
		}
	}
}

func askQuestion(ctx context.Context, qs *qdrantService, cfg Config, question string) (string, []string, error) {
	embs, err := ollamaEmbed(cfg.OllamaBaseURL, cfg.OllamaEmbedModel, []string{question})
	if err != nil {
		return "", nil, err
	}
	limit := uint64(cfg.ChatTopK)
	searchReq := &qdrant.QueryPoints{CollectionName: cfg.CollectionName, Limit: &limit, WithPayload: qdrant.NewWithPayload(true), Query: qdrant.NewQuery(embs[0]...)}
	if cfg.ChatScoreThreshold != nil {
		searchReq.ScoreThreshold = cfg.ChatScoreThreshold
	}
	resp, err := qs.points.Query(ctx, searchReq)
	if err != nil {
		return "", nil, err
	}
	if len(resp.Result) == 0 {
		return "Ich konnte in den indexierten Dokumenten nichts Passendes finden.", nil, nil
	}
	var contextParts []string
	sourceSet := map[string]struct{}{}
	for _, p := range resp.Result {
		sourcePath := payloadString(p.Payload, "source_path")
		headingPath := payloadString(p.Payload, "heading_path")
		content := payloadString(p.Payload, "content")
		contextParts = append(contextParts, fmt.Sprintf("Source: %s\nSection: %s\nContent:\n%s", sourcePath, headingPath, content))
		sourceSet[fmt.Sprintf("%s — %s", sourcePath, headingPath)] = struct{}{}
	}
	prompt := fmt.Sprintf("Use the following documentation context to answer the question. If the answer is not in the context, say so clearly.\n\nContext:\n%s\n\nQuestion: %s", strings.Join(contextParts, "\n\n---\n\n"), question)
	answer, err := ollamaChat(cfg.OllamaBaseURL, cfg.OllamaChatModel, cfg.ChatSystemPrompt, prompt)
	if err != nil {
		return "", nil, err
	}
	sources := make([]string, 0, len(sourceSet))
	for s := range sourceSet {
		sources = append(sources, s)
	}
	sort.Strings(sources)
	return answer, sources, nil
}

func ollamaChat(baseURL, model, systemPrompt, userPrompt string) (string, error) {
	payload := chatRequest{Model: model, Stream: false, Messages: []chatMessage{{Role: "system", Content: systemPrompt}, {Role: "user", Content: userPrompt}}}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(strings.TrimRight(baseURL, "/")+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama chat failed: %s", strings.TrimSpace(string(b)))
	}
	var outResp chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&outResp); err != nil {
		return "", err
	}
	return strings.TrimSpace(outResp.Message.Content), nil
}

func payloadString(payload map[string]*qdrant.Value, key string) string {
	if v, ok := payload[key]; ok {
		return v.GetStringValue()
	}
	return ""
}

func SaveChatExample() {
	_, _ = os.Stdout.Write(nil)
}
