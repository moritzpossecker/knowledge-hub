"use client";

import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MessageBubble({
  message,
  onSourceClick
}: {
  message: ChatMessage;
  onSourceClick: (sourcePath: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {isUser ? (
        <div className="max-w-[80%] rounded-3xl bg-primary px-4 py-2.5">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-primary-foreground">
            {message.content}
          </p>
        </div>
      ) : (
        <div className="max-w-[80%] rounded-3xl bg-card px-4 py-2.5">
          <Markdown content={message.content} className="max-w-none text-base" />
        </div>
      )}
      {message.sources.length > 0 && (
        <div className="flex max-w-[80%] flex-wrap gap-1.5">
          {message.sources.map((source, index) => (
            <button
              key={`${source.sourcePath}-${source.headingPath}-${index}`}
              type="button"
              onClick={() => onSourceClick(source.sourcePath)}
              className="cursor-pointer"
            >
              <Badge
                variant="secondary"
                className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                {source.sourcePath}
                {source.headingPath ? ` › ${source.headingPath}` : ""}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
