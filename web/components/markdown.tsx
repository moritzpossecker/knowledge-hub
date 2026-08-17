"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-neutral max-w-none",
        "prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground",
        "prose-a:text-foreground prose-a:underline prose-li:text-foreground prose-blockquote:text-foreground",
        "prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-muted",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
