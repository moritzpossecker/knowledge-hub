package kh

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	qdrant "github.com/qdrant/go-client/qdrant"
)

func RunCollectionCheck(cfg Config, extended bool, limit uint64, out io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	qs, conn, err := newQdrantService(ctx, cfg)
	if err != nil {
		return err
	}
	defer conn.Close()

	info, err := qs.collections.Get(ctx, &qdrant.GetCollectionInfoRequest{CollectionName: cfg.CollectionName})
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "Collection: %s\n", cfg.CollectionName)
	fmt.Fprintf(out, "Status: %s\n", info.Result.Status.String())
	fmt.Fprintf(out, "Points: %d\n", info.Result.PointsCount)
	if !extended {
		return nil
	}
	scrollLimit := uint32(limit)
	resp, err := qs.points.Scroll(ctx, &qdrant.ScrollPoints{CollectionName: cfg.CollectionName, Limit: &scrollLimit, WithPayload: qdrant.NewWithPayload(true)})
	if err != nil {
		return err
	}
	for i, p := range resp.Result {
		fmt.Fprintf(out, "\nPoint %d\n", i+1)
		fmt.Fprintf(out, "  id: %s\n", p.Id.GetUuid())
		fmt.Fprintf(out, "  source_path: %s\n", payloadString(p.Payload, "source_path"))
		fmt.Fprintf(out, "  heading_path: %s\n", payloadString(p.Payload, "heading_path"))
		content := payloadString(p.Payload, "content")
		if len(content) > 240 {
			content = content[:240] + "..."
		}
		fmt.Fprintf(out, "  content: %s\n", strings.ReplaceAll(content, "\n", " "))
	}
	return nil
}
