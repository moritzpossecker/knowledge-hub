package cmd

import (
	"os"

	"github.com/moritzpossecker/knowledge-hub-go/internal/kh"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:           "knowledge-hub",
	Short:         "Search and chat with your documentation",
	Long:          "Knowledge Hub indexes Markdown documentation with Ollama and Qdrant, then makes it available for grounded chat.",
	SilenceUsage:  true,
	SilenceErrors: true,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		uiHeader(cmd.OutOrStdout(), cmd.Name(), cmd.Short)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		uiError(os.Stderr, err)
		os.Exit(1)
	}
}

func mustLoadConfig(cmd *cobra.Command) kh.Config {
	cfg, err := kh.LoadConfig(".env")
	if err != nil {
		cmd.PrintErrf("warning: could not load .env; using defaults (%v)\n", err)
	}
	return cfg
}
