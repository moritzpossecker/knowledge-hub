"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import type { SourceDocument } from "@/lib/types";
import { X } from "lucide-react";

export function SourcePanel({ sourcePath, onClose }: { sourcePath: string; onClose: () => void }) {
  const [doc, setDoc] = useState<SourceDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open, no query library in scope
    setLoading(true);
    setError(null);
    setDoc(null);

    fetch(`/api/sources?path=${encodeURIComponent(sourcePath)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load source");
        }
        return (await res.json()) as SourceDocument;
      })
      .then((data) => {
        if (!cancelled) {
          setDoc(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load source");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{doc?.title || sourcePath}</p>
          <p className="truncate text-xs text-muted-foreground">{doc?.sourcePath ?? sourcePath}</p>
        </div>
        <Button onClick={onClose} size="icon" variant="ghost" className="size-7 shrink-0 rounded-full">
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-5">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {doc && <Markdown content={doc.content} />}
        </div>
      </ScrollArea>
    </div>
  );
}
