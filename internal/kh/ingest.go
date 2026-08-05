package kh

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	qdrant "github.com/qdrant/go-client/qdrant"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"gopkg.in/yaml.v3"
)

type Chunk struct {
	PointID     string
	DocumentID  string
	SourcePath  string
	FileName    string
	Title       string
	Headings    []string
	HeadingPath string
	ChunkIndex  int
	Content     string
	ContentHash string
	FileHash    string
	ModifiedAt  string
}

type IngestStats struct {
	Files  int
	Chunks int
}

type embedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

type qdrantService struct {
	collections qdrant.CollectionsClient
	points      qdrant.PointsClient
}

func RunIngest(cfg Config) (IngestStats, error) {
	return runIngest(cfg, nil)
}

// RunIngestWithProgress performs ingestion and writes file and upload progress
// to out. Passing nil suppresses progress output.
func RunIngestWithProgress(cfg Config, out io.Writer) (IngestStats, error) {
	return runIngest(cfg, out)
}

func runIngest(cfg Config, out io.Writer) (IngestStats, error) {
	root := cfg.MarkdownRoot
	cleanup := func() {}
	if isGitURL(root) {
		var err error
		root, cleanup, err = cloneRepo(root)
		if err != nil {
			return IngestStats{}, err
		}
		defer cleanup()
	}

	files, err := iterMarkdownFiles(root)
	if err != nil {
		return IngestStats{}, err
	}
	if len(files) == 0 {
		return IngestStats{}, fmt.Errorf("no markdown files found in %s", root)
	}
	progressf(out, "› Found %d Markdown files\n", len(files))
	progressf(out, "› Connecting to Qdrant and preparing the collection\n")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	qs, conn, err := newQdrantService(ctx, cfg)
	if err != nil {
		return IngestStats{}, err
	}
	defer conn.Close()

	vectorSize, err := inferVectorSize(cfg)
	if err != nil {
		return IngestStats{}, err
	}
	if err := ensureCollection(ctx, qs, cfg, uint64(vectorSize)); err != nil {
		return IngestStats{}, err
	}
	progressf(out, "✓ Collection ready — starting upload\n\n")

	existing := map[string]struct{}{}
	var totalChunks int
	for fileIndex, file := range files {
		rel, err := filepath.Rel(root, file)
		if err != nil {
			return IngestStats{}, err
		}
		rel = filepath.ToSlash(rel)
		progressf(out, "[%d/%d]  %s\n", fileIndex+1, len(files), rel)
		chunks, err := buildChunks(root, file)
		if err != nil {
			return IngestStats{}, err
		}
		if len(chunks) == 0 {
			progressf(out, "         ↳ skipped (no indexable content)\n")
			continue
		}
		existing[chunks[0].DocumentID] = struct{}{}
		if err := deleteDocumentPoints(ctx, qs, cfg.CollectionName, chunks[0].DocumentID); err != nil {
			return IngestStats{}, err
		}
		progressf(out, "         ↳ embedding and uploading %d chunks\n", len(chunks))
		if err := upsertChunks(ctx, qs, cfg, chunks, func(uploaded, total int) {
			progressf(out, "         ↳ uploaded %d/%d chunks\n", uploaded, total)
		}); err != nil {
			return IngestStats{}, err
		}
		totalChunks += len(chunks)
		progressf(out, "         ✓ complete\n")
	}
	if cfg.DeleteMissingFiles {
		progressf(out, "\n› Removing vectors for missing source files\n")
		if err := deleteMissingDocuments(ctx, qs, cfg, existing); err != nil {
			return IngestStats{}, err
		}
	}
	return IngestStats{Files: len(files), Chunks: totalChunks}, nil
}

func progressf(out io.Writer, format string, args ...any) {
	if out != nil {
		_, _ = fmt.Fprintf(out, format, args...)
	}
}

func iterMarkdownFiles(root string) ([]string, error) {
	exts := map[string]struct{}{".md": {}, ".markdown": {}, ".mdown": {}, ".mkd": {}}
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if _, ok := exts[strings.ToLower(filepath.Ext(path))]; ok {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)
	return files, err
}

func buildChunks(root, filePath string) ([]Chunk, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	text := string(raw)
	info, err := os.Stat(filePath)
	if err != nil {
		return nil, err
	}
	modified := info.ModTime().UTC().Format(time.RFC3339)
	front, body := extractFrontmatter(text)
	title := cleanTitle(filePath, front, body)
	fileHash := sha256Text(text)
	rel, err := filepath.Rel(root, filePath)
	if err != nil {
		return nil, err
	}
	rel = filepath.ToSlash(rel)
	docID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rel)).String()
	sections := splitMarkdownByHeadings(body)
	chunks := make([]Chunk, 0, len(sections))
	for i, sec := range sections {
		contentHash := sha256Text(sec.Content)
		pid := uuid.NewSHA1(uuid.NameSpaceOID, []byte(fmt.Sprintf("%s:%d:%s", rel, i, contentHash))).String()
		headingPath := title
		if len(sec.Headings) > 0 {
			headingPath = strings.Join(sec.Headings, " > ")
		}
		chunks = append(chunks, Chunk{PointID: pid, DocumentID: docID, SourcePath: rel, FileName: filepath.Base(filePath), Title: title, Headings: sec.Headings, HeadingPath: headingPath, ChunkIndex: i, Content: sec.Content, ContentHash: contentHash, FileHash: fileHash, ModifiedAt: modified})
	}
	return chunks, nil
}

type mdSection struct {
	Headings []string
	Content  string
}

func extractFrontmatter(text string) (map[string]any, string) {
	if !strings.HasPrefix(text, "---\n") {
		return map[string]any{}, text
	}
	re := regexp.MustCompile(`(?s)^---\n(.*?)\n---\n?`)
	m := re.FindStringSubmatchIndex(text)
	if m == nil {
		return map[string]any{}, text
	}
	raw := text[m[2]:m[3]]
	body := text[m[1]:]
	var data map[string]any
	if err := yaml.Unmarshal([]byte(raw), &data); err != nil || data == nil {
		return map[string]any{}, body
	}
	return data, body
}

func cleanTitle(path string, frontmatter map[string]any, body string) string {
	if v, ok := frontmatter["title"].(string); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.ReplaceAll(base, "_", " ")
	return strings.TrimSpace(base)
}

func splitMarkdownByHeadings(text string) []mdSection {
	lines := strings.Split(text, "\n")
	re := regexp.MustCompile(`^(#{1,6})\s+(.*\S)\s*$`)
	var sections []mdSection
	var headings []string
	var current []string
	flush := func() {
		content := strings.TrimSpace(strings.Join(current, "\n"))
		if content != "" {
			cp := append([]string{}, headings...)
			sections = append(sections, mdSection{Headings: cp, Content: content})
		}
		current = nil
	}
	for _, line := range lines {
		m := re.FindStringSubmatch(line)
		if m != nil {
			flush()
			level := len(m[1])
			head := strings.TrimSpace(m[2])
			if level-1 < len(headings) {
				headings = append([]string{}, headings[:level-1]...)
			}
			headings = append(headings, head)
			current = []string{line}
		} else {
			current = append(current, line)
		}
	}
	flush()
	if len(sections) > 0 {
		return sections
	}
	fallback := strings.TrimSpace(text)
	if fallback == "" {
		return nil
	}
	return []mdSection{{Headings: nil, Content: fallback}}
}

func sha256Text(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func ollamaEmbed(baseURL, model string, texts []string) ([][]float32, error) {
	payload := map[string]any{"model": model, "input": texts}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/api/embed", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama embed failed: %s", strings.TrimSpace(string(b)))
	}
	var out embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Embeddings) == 0 {
		return nil, fmt.Errorf("ollama returned no embeddings")
	}
	return out.Embeddings, nil
}

func inferVectorSize(cfg Config) (int, error) {
	embs, err := ollamaEmbed(cfg.OllamaBaseURL, cfg.OllamaModel, []string{"vector size probe"})
	if err != nil {
		return 0, err
	}
	return len(embs[0]), nil
}

func newQdrantService(ctx context.Context, cfg Config) (*qdrantService, *grpc.ClientConn, error) {
	addr, err := QdrantGRPCAddress(cfg.QdrantBaseURL, strconv.Itoa(cfg.QdrantGRPCPort))
	if err != nil {
		return nil, nil, err
	}
	conn, err := grpc.DialContext(ctx, addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, err
	}
	return &qdrantService{collections: qdrant.NewCollectionsClient(conn), points: qdrant.NewPointsClient(conn)}, conn, nil
}

func ensureCollection(ctx context.Context, qs *qdrantService, cfg Config, vectorSize uint64) error {
	if cfg.RecreateCollection {
		_, _ = qs.collections.Delete(ctx, &qdrant.DeleteCollection{CollectionName: cfg.CollectionName})
	}
	if _, err := qs.collections.Get(ctx, &qdrant.GetCollectionInfoRequest{CollectionName: cfg.CollectionName}); err != nil {
		_, err = qs.collections.Create(ctx, &qdrant.CreateCollection{CollectionName: cfg.CollectionName, VectorsConfig: qdrant.NewVectorsConfig(&qdrant.VectorParams{Size: vectorSize, Distance: qdrant.Distance_Cosine})})
		if err != nil {
			return err
		}
	}
	return nil
}

func deleteDocumentPoints(ctx context.Context, qs *qdrantService, collectionName, documentID string) error {
	_, err := qs.points.Delete(ctx, &qdrant.DeletePoints{CollectionName: collectionName, Wait: boolPtr(true), Points: &qdrant.PointsSelector{PointsSelectorOneOf: &qdrant.PointsSelector_Filter{Filter: &qdrant.Filter{Must: []*qdrant.Condition{{ConditionOneOf: &qdrant.Condition_Field{Field: &qdrant.FieldCondition{Key: "document_id", Match: &qdrant.Match{MatchValue: &qdrant.Match_Keyword{Keyword: documentID}}}}}}}}}})
	return err
}

func deleteMissingDocuments(ctx context.Context, qs *qdrantService, cfg Config, existing map[string]struct{}) error {
	scrollLimit := uint32(256)
	offset := &qdrant.ScrollPoints{CollectionName: cfg.CollectionName, WithPayload: qdrant.NewWithPayload(true), Limit: &scrollLimit}
	stale := map[string]struct{}{}
	for {
		resp, err := qs.points.Scroll(ctx, offset)
		if err != nil {
			return err
		}
		for _, p := range resp.Result {
			if doc, ok := p.Payload["document_id"]; ok {
				id := doc.GetStringValue()
				if _, exists := existing[id]; !exists {
					stale[id] = struct{}{}
				}
			}
		}
		if resp.NextPageOffset == nil {
			break
		}
		offset.Offset = resp.NextPageOffset
	}
	for id := range stale {
		if err := deleteDocumentPoints(ctx, qs, cfg.CollectionName, id); err != nil {
			return err
		}
	}
	return nil
}

func upsertChunks(ctx context.Context, qs *qdrantService, cfg Config, chunks []Chunk, onUploaded func(uploaded, total int)) error {
	texts := make([]string, 0, len(chunks))
	for _, c := range chunks {
		texts = append(texts, c.Content)
	}
	var vectors [][]float32
	for i := 0; i < len(texts); i += cfg.EmbedBatchSize {
		end := i + cfg.EmbedBatchSize
		if end > len(texts) {
			end = len(texts)
		}
		embs, err := ollamaEmbed(cfg.OllamaBaseURL, cfg.OllamaModel, texts[i:end])
		if err != nil {
			return err
		}
		vectors = append(vectors, embs...)
	}
	points := make([]*qdrant.PointStruct, 0, len(chunks))
	for i, c := range chunks {
		payload := map[string]*qdrant.Value{
			"document_id":  valueString(c.DocumentID),
			"source_path":  valueString(c.SourcePath),
			"file_name":    valueString(c.FileName),
			"title":        valueString(c.Title),
			"headings":     valueStrings(c.Headings),
			"heading_path": valueString(c.HeadingPath),
			"chunk_index":  valueInt(int64(c.ChunkIndex)),
			"content":      valueString(c.Content),
			"content_hash": valueString(c.ContentHash),
			"file_hash":    valueString(c.FileHash),
			"modified_at":  valueString(c.ModifiedAt),
		}
		points = append(points, &qdrant.PointStruct{Id: &qdrant.PointId{PointIdOptions: &qdrant.PointId_Uuid{Uuid: c.PointID}}, Vectors: qdrant.NewVectors(vectors[i]...), Payload: payload})
	}
	for i := 0; i < len(points); i += cfg.QdrantBatchSize {
		end := i + cfg.QdrantBatchSize
		if end > len(points) {
			end = len(points)
		}
		_, err := qs.points.Upsert(ctx, &qdrant.UpsertPoints{CollectionName: cfg.CollectionName, Wait: boolPtr(true), Points: points[i:end]})
		if err != nil {
			return err
		}
		if onUploaded != nil {
			onUploaded(end, len(points))
		}
	}
	return nil
}
