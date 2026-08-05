package kh

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func IsHTTPHealthy(url string) bool {
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func QdrantHealthURL(baseURL string) string {
	return strings.TrimRight(baseURL, "/") + "/collections"
}

// ParseQdrantURL validates QDRANT_BASE_URL and exposes its connection parts
// where they are needed for health checks and Docker port mappings.
func ParseQdrantURL(raw string) (host, port string, useHTTPS bool, err error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", "", false, fmt.Errorf("invalid Qdrant URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", "", false, fmt.Errorf("Qdrant URL must start with http:// or https://")
	}
	if u.Hostname() == "" {
		return "", "", false, fmt.Errorf("Qdrant URL must include a host")
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", "", false, fmt.Errorf("Qdrant URL must contain only scheme, host, and optional port")
	}
	port = u.Port()
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "6333"
		}
	}
	return u.Hostname(), port, u.Scheme == "https", nil
}

func QdrantGRPCAddress(baseURL, grpcPort string) (string, error) {
	host, _, _, err := ParseQdrantURL(baseURL)
	if err != nil {
		return "", err
	}
	port, err := strconv.Atoi(grpcPort)
	if err != nil {
		return "", fmt.Errorf("invalid Qdrant gRPC port %q: %w", grpcPort, err)
	}
	if port < 1 || port > 65535 {
		return "", fmt.Errorf("Qdrant gRPC port must be between 1 and 65535")
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

// URLPort returns the configured port or the supplied default when omitted.
func URLPort(rawURL, defaultPort string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return "", fmt.Errorf("invalid URL %q", rawURL)
	}
	if port := u.Port(); port != "" {
		return port, nil
	}
	return defaultPort, nil
}

func IsLocalhost(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "localhost" {
		return true
	}
	addr, err := netip.ParseAddr(host)
	return err == nil && addr.IsLoopback()
}

type ollamaTagsResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

// OllamaMissingModels returns the requested models that are not installed.
func OllamaMissingModels(baseURL string, models []string) ([]string, error) {
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Get(strings.TrimRight(baseURL, "/") + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Ollama returned HTTP %d", resp.StatusCode)
	}
	var tags ollamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return nil, fmt.Errorf("read Ollama model list: %w", err)
	}
	installed := make([]string, 0, len(tags.Models))
	for _, model := range tags.Models {
		installed = append(installed, model.Name)
	}
	return missingOllamaModels(installed, models), nil
}

func missingOllamaModels(installedModels, requestedModels []string) []string {
	installed := make(map[string]struct{}, len(installedModels))
	for _, model := range installedModels {
		installed[model] = struct{}{}
		// Ollama reports the implicit latest tag (for example
		// "llama3.1:latest"), while users commonly configure "llama3.1".
		installed[strings.TrimSuffix(model, ":latest")] = struct{}{}
	}
	missing := make([]string, 0)
	seen := make(map[string]struct{})
	for _, model := range requestedModels {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		if _, duplicate := seen[model]; duplicate {
			continue
		}
		seen[model] = struct{}{}
		if _, ok := installed[model]; !ok {
			missing = append(missing, model)
		}
	}
	return missing
}

// PullOllamaModel asks Ollama to download a model and waits for completion.
func PullOllamaModel(baseURL, model string) error {
	body, err := json.Marshal(map[string]any{"name": model, "stream": false})
	if err != nil {
		return err
	}
	resp, err := http.Post(strings.TrimRight(baseURL, "/")+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Ollama returned HTTP %d while installing %s", resp.StatusCode, model)
	}
	return nil
}
