package cmd

import (
	"fmt"
	"os"

	"github.com/moritzpossecker/knowledge-hub-go/internal/kh"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "knowledge-hub",
	Short: "CLI for local document ingestion and chat",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func mustLoadConfig(cmd *cobra.Command) kh.Config {
	cfg, err := kh.LoadConfig(".env")
	if err != nil {
		cmd.PrintErrf("warning: could not load .env, using defaults: %v\n", err)
	}
	return cfg
}
