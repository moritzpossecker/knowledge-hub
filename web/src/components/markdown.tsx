"use client";

import type { ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/src/lib/utils";

type MarkdownComponent = ComponentType<any>;

export function Markdown({
  content,
  className,
  components,
}: {
  content: string;
  className?: string;
  components?: Record<string, MarkdownComponent>;
}) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-neutral max-w-none",
        "prose-headings:text-foreground",
        "prose-p:text-foreground",
        "prose-strong:text-foreground",
        "prose-em:text-foreground",
        "prose-a:text-foreground prose-a:underline",
        "prose-li:text-foreground",
        "prose-blockquote:text-foreground",
        "prose-code:text-foreground",
        "prose-code:before:content-none",
        "prose-code:after:content-none",
        "prose-pre:rounded-xl",
        "prose-pre:border",
        "prose-pre:border-border",
        "prose-pre:bg-muted",
        "[&>p]:my-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
