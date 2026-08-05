package kh

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
)

func RunComposeUp(path, qdrantHTTPPort, qdrantGRPCPort, ollamaPort string) error {
	cmd := exec.Command("docker", "compose", "-f", path, "up", "-d")
	for _, port := range []struct {
		name  string
		value string
	}{
		{"Qdrant HTTP", qdrantHTTPPort},
		{"Qdrant gRPC", qdrantGRPCPort},
		{"Ollama", ollamaPort},
	} {
		value, err := strconv.Atoi(port.value)
		if err != nil || value < 1 || value > 65535 {
			return fmt.Errorf("invalid %s port %q", port.name, port.value)
		}
	}
	cmd.Env = append(os.Environ(),
		"QDRANT_HTTP_PORT="+qdrantHTTPPort,
		"QDRANT_GRPC_PORT="+qdrantGRPCPort,
		"OLLAMA_PORT="+ollamaPort,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker compose up failed: %w", err)
	}
	return nil
}
