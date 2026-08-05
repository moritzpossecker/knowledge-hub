package cmd

import (
	"fmt"
	"io"
	"os"
)

const (
	uiReset = "\x1b[0m"
	uiBold  = "\x1b[1m"
	uiDim   = "\x1b[2m"
	uiCyan  = "\x1b[36m"
	uiGreen = "\x1b[32m"
	uiRed   = "\x1b[31m"
)

func uiColorEnabled(out io.Writer) bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	f, ok := out.(*os.File)
	if !ok {
		return false
	}
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

func uiStyle(out io.Writer, style, text string) string {
	if !uiColorEnabled(out) {
		return text
	}
	return style + text + uiReset
}

func uiHeader(out io.Writer, command, description string) {
	fmt.Fprintf(out, "\n%s  %s\n", uiStyle(out, uiBold+uiCyan, "✦ knowledge hub"), uiStyle(out, uiDim, "/ "+command))
	fmt.Fprintf(out, "%s\n\n", uiStyle(out, uiDim, description))
}

func uiSuccess(out io.Writer, message string) {
	fmt.Fprintf(out, "%s %s\n", uiStyle(out, uiGreen, "✓"), message)
}

func uiNote(out io.Writer, message string) {
	fmt.Fprintf(out, "%s %s\n", uiStyle(out, uiCyan, "›"), message)
}

func uiError(out io.Writer, err error) {
	fmt.Fprintf(out, "%s %s\n", uiStyle(out, uiRed+uiBold, "Error:"), err)
}
