"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";

export function MessageInput({
  onSend,
  onStop,
  sending,
  autoFocus
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  sending: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || sending) {
      return;
    }
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="flex items-end gap-2 rounded-3xl border border-border bg-secondary/60 p-2 pl-4 shadow-lg shadow-black/20 backdrop-blur">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Ask about your indexed documentation…"
        rows={1}
        autoFocus={autoFocus}
        className="max-h-48 min-h-12 flex-1 resize-none border-0 bg-transparent px-0 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
        disabled={sending}
      />
      {sending ? (
        <Button
          onClick={onStop}
          size="icon"
          variant="secondary"
          className="size-9 shrink-0 rounded-full"
          title="Stop generating"
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button onClick={submit} disabled={!value.trim()} size="icon" className="size-9 shrink-0 rounded-full">
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  );
}
