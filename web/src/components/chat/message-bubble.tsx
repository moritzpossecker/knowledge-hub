"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Markdown } from "@/src/components/markdown";
import type { ChatMessage, Source } from "@/src/lib/types";
import { cn } from "@/src/lib/utils";

interface SourceCodeProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  children?: ReactNode;
}

const sourceRegex = /\[([^\]]+)\]/g;

function getEffectiveSources(
  content: string,
  messageSources: Source[],
): Source[] {
  const effectiveSources = [...messageSources];

  const knownPaths = new Set(
    messageSources.map((source) => source.sourcePath),
  );

  const sourceMatches = content.matchAll(sourceRegex);

  for (const match of sourceMatches) {
    const sourcePath = match[1].trim();

    if (!sourcePath || knownPaths.has(sourcePath)) {
      continue;
    }

    effectiveSources.push({
      sourcePath,
      headingPath: null,
    });

    knownPaths.add(sourcePath);
  }

  return effectiveSources;
}

export function MessageBubble({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick: (source: Source) => void;
}) {
  const isUser = message.role === "user";

  const sources = isUser
    ? message.sources
    : getEffectiveSources(message.content, message.sources);

  const renderContentWithSources = (
    content: string,
    sources: Source[],
  ) => {
    if (isUser || sources.length === 0) {
      return (
        <Markdown
          content={content}
          className="max-w-none text-base"
        />
      );
    }

    const processedContent = content.replace(
      sourceRegex,
      (_v: string, sourcePath: string) => {
        return `\`${sourcePath}\``;
      },
    );

    return (
      <Markdown
        content={processedContent}
        className="max-w-none text-base leading-relaxed"
        components={{
          code: ({
            children,
            className,
            ...props
          }: SourceCodeProps) => {
            const value = String(children).replace(/\n$/, "");

            const source = sources.find((source) => source.sourcePath === value);

            if (!source) {
              return null;
            }

            return (
              <button
                type="button"
                onClick={() => onSourceClick(source)}
                aria-label={`${source.sourcePath}`}
                className="mx-0.5 inline-flex translate-y-[-1px] align-middle"
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 cursor-pointer rounded-full",
                    "bg-background px-2",
                    "text-xs font-medium text-muted-foreground",
                    "transition-colors",
                    "hover:bg-muted hover:text-foreground",
                  )}
                >
                  {source.sourcePath}
                </Badge>
              </button>
            );
          },
        }}
      />
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      {isUser ? (
        <div className="max-w-[80%] rounded-3xl bg-primary px-4 py-2.5">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-primary-foreground">
            {message.content}
          </p>
        </div>
      ) : (
        <div className="max-w-[80%] rounded-3xl bg-card px-4 py-2.5">
          {renderContentWithSources(message.content, sources)}
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex max-w-[80%] flex-wrap gap-1.5">
          {sources.map((source, index) => (
            <button
              key={`${source.sourcePath}-${source.headingPath ?? "null"}-${index}`}
              type="button"
              onClick={() => onSourceClick(source)}
              className="cursor-pointer"
            >
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full",
                  "text-xs text-muted-foreground",
                  "transition-colors hover:text-foreground",
                )}
              >
                {source.sourcePath}
                {source.headingPath
                  ? ` › ${source.headingPath}`
                  : ""}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
