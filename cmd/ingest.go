package cmd

import (
	"fmt"

	"github.com/moritzpossecker/knowledge-hub-go/internal/kh"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(ingestCmd)
}

var ingestCmd = &cobra.Command{
	Use:   "ingest [path-or-git-url]",
	Short: "Ingest markdown docs and run collection check afterwards",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := mustLoadConfig(cmd)
		if len(args) == 1 {
			cfg.MarkdownRoot = args[0]
		}
		stats, err := kh.RunIngestWithProgress(cfg, cmd.OutOrStdout())
		if err != nil {
			return err
		}
		uiSuccess(cmd.OutOrStdout(), fmt.Sprintf("Indexed %d files and %d chunks.", stats.Files, stats.Chunks))
		return kh.RunCollectionCheck(cfg, true, 1, cmd.OutOrStdout())
	},
}
