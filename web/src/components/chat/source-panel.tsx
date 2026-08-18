"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Markdown } from "@/src/components/markdown";
import type { Source, SourceDocument } from "@/src/lib/types";
import { X } from "lucide-react";

export function SourcePanel({ source, onClose }: { source: Source; onClose: () => void }) {
  const [doc, setDoc] = useState<SourceDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open, no query library in scope
    setLoading(true);
    setError(null);
    setDoc(null);

    fetch(`/api/sources?path=${encodeURIComponent(source.sourcePath)}`)
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
  }, [source.sourcePath]);

  useEffect(() => {
    if (!source.headingPath || !panelRef.current || !contentRef.current || !doc) return;

    const panel = panelRef.current;
    const content = contentRef.current;
    const headingText = source.headingPath.split(" > ").pop()?.trim();

    if (!headingText) return;

    const timeout = setTimeout(() => {
      const headingElement = Array.from(content.querySelectorAll("h1, h2, h3, h4, h5, h6")).find(
        (el) => el.textContent?.trim().toLowerCase() === headingText.toLowerCase()
      );

      if (headingElement) {
        const elementTop = (headingElement as HTMLElement).offsetTop;
        const allElements = Array.from(panel.querySelectorAll('*'));
        const scrollableCandidates = allElements.filter(el => {
          const style = window.getComputedStyle(el);
          return style.overflowY === 'auto' || style.overflowY === 'scroll';
        });

        for (const candidate of scrollableCandidates) {
          (candidate as HTMLElement).scrollTop = elementTop;
        }
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [doc, source.headingPath]);

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{doc?.title || source.sourcePath}</p>
          <p className="truncate text-xs text-muted-foreground">{doc?.sourcePath ?? source.sourcePath}</p>
        </div>
        <Button onClick={onClose} size="icon" variant="ghost" className="size-7 shrink-0 rounded-full">
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div ref={contentRef} className="px-5 py-5">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {doc && <Markdown content={doc.content} />}
        </div>
      </ScrollArea>
    </div>
  );
}
