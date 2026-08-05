package kh

import (
	"fmt"
	"os"
	"os/exec"
)

func RunComposeUp(path string) error {
	cmd := exec.Command("docker", "compose", "-f", path, "up", "-d")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker compose up failed: %w", err)
	}
	return nil
}
