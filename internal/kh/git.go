package kh

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func isGitURL(s string) bool {
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "git@")
}

func cloneRepo(url string) (string, func(), error) {
	dir, err := os.MkdirTemp("", "knowledge-hub-repo-*")
	if err != nil {
		return "", nil, err
	}
	target := filepath.Join(dir, "repo")
	cmd := exec.Command("git", "clone", "--depth", "1", url, target)
	if out, err := cmd.CombinedOutput(); err != nil {
		_ = os.RemoveAll(dir)
		return "", nil, fmt.Errorf("git clone failed: %v: %s", err, strings.TrimSpace(string(out)))
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	return target, cleanup, nil
}
