package cmd

import (
	"github.com/moritzpossecker/knowledge-hub-go/internal/kh"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(chatCmd)
}

var chatCmd = &cobra.Command{
	Use:   "chat",
	Short: "Chat with indexed markdown docs",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := mustLoadConfig(cmd)
		return kh.RunChat(cfg, cmd.InOrStdin(), cmd.OutOrStdout())
	},
}
