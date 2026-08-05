package kh

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
)

func RunComposeUp(path, qdrantHTTPPort, ollamaPort string) error {
	cmd := exec.Command("docker", "compose", "-f", path, "up", "-d")
	qdrantGRPCPort, err := strconv.Atoi(qdrantHTTPPort)
	if err != nil {
		return fmt.Errorf("invalid Qdrant HTTP port %q: %w", qdrantHTTPPort, err)
	}
	cmd.Env = append(os.Environ(),
		"QDRANT_HTTP_PORT="+qdrantHTTPPort,
		"QDRANT_GRPC_PORT="+strconv.Itoa(qdrantGRPCPort+1),
		"OLLAMA_PORT="+ollamaPort,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker compose up failed: %w", err)
	}
	return nil
}
