package kh

import "testing"

func TestParseQdrantURL(t *testing.T) {
	tests := []struct {
		name       string
		url        string
		host, port string
		useHTTPS   bool
		wantErr    bool
	}{
		{"HTTP URL", "http://localhost:6333", "localhost", "6333", false, false},
		{"HTTPS default port", "https://qdrant.example.com", "qdrant.example.com", "443", true, false},
		{"missing scheme", "localhost:6333", "", "", false, true},
		{"path is not allowed", "http://localhost:6333/dashboard", "", "", false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			host, port, useHTTPS, err := ParseQdrantURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseQdrantURL() error = %v, wantErr %t", err, tt.wantErr)
			}
			if !tt.wantErr && (host != tt.host || port != tt.port || useHTTPS != tt.useHTTPS) {
				t.Fatalf("ParseQdrantURL() = (%q, %q, %t), want (%q, %q, %t)", host, port, useHTTPS, tt.host, tt.port, tt.useHTTPS)
			}
		})
	}
}

func TestIsLocalhost(t *testing.T) {
	for _, tt := range []struct {
		url  string
		want bool
	}{
		{"http://localhost:6333", true},
		{"http://127.0.0.1:6333", true},
		{"http://[::1]:6333", true},
		{"https://qdrant.example.com", false},
	} {
		if got := IsLocalhost(tt.url); got != tt.want {
			t.Errorf("IsLocalhost(%q) = %t, want %t", tt.url, got, tt.want)
		}
	}
}

func TestOllamaMissingModelsRecognizesImplicitLatestTag(t *testing.T) {
	missing := missingOllamaModels(
		[]string{"embeddinggemma:latest", "llama3.1:8b"},
		[]string{"embeddinggemma", "llama3.1:8b", "missing"},
	)
	if len(missing) != 1 || missing[0] != "missing" {
		t.Fatalf("missingOllamaModels() = %v, want [missing]", missing)
	}
}
