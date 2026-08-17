"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/lib/types";
import { PanelLeftClose, PenSquare, Trash2 } from "lucide-react";

export function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onCollapse
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-72 flex-col bg-sidebar">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold tracking-tight">Knowledge Hub</span>
        <div className="flex items-center gap-1">
          <Button
            onClick={onNew}
            size="icon"
            variant="ghost"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            title="New chat"
          >
            <PenSquare className="size-4" />
          </Button>
          <Button
            onClick={onCollapse}
            size="icon"
            variant="ghost"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-0.5 pb-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground",
                session.id === activeId && "bg-primary/15 text-foreground"
              )}
              onClick={() => onSelect(session.id)}
            >
              <span className="truncate">{session.title}</span>
              <button
                type="button"
                className="cursor-pointer opacity-0 hover:text-destructive group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(session.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">No chats yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
