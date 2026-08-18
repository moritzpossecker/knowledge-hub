"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SessionSidebar } from "./session-sidebar";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { SourcePanel } from "./source-panel";
import { ThinkingIndicator } from "./thinking-indicator";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/src/components/ui/resizable";
import { cn } from "@/src/lib/utils";
import type { ChatMessage, SessionDetail, SessionSummary } from "@/src/lib/types";
import { PanelLeftOpen } from "lucide-react";

export function ChatApp() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    const data = (await res.json()) as SessionSummary[];
    setSessions(data);
    return data;
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as SessionDetail;
    setMessages(data.messages);
    setActiveId(id);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, no query library in scope
    loadSessions().then((data) => {
      if (data.length > 0) {
        loadSession(data[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: { models: string[]; defaultModel: string }) => {
        setModels(data.models);
        setModel(data.defaultModel);
      })
      .catch(() => {});
  }, []);

  const handleNew = useCallback(async () => {
    const res = await fetch("/api/sessions", { method: "POST" });
    const session = (await res.json()) as SessionSummary;
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setMessages([]);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((session) => session.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    },
    [activeId]
  );

  const handleSend = useCallback(
    async (text: string) => {
      let sessionId = activeId;
      if (!sessionId) {
        const res = await fetch("/api/sessions", { method: "POST" });
        const session = (await res.json()) as SessionSummary;
        sessionId = session.id;
        setActiveId(sessionId);
        setSessions((prev) => [session, ...prev]);
      }

      const pendingId = `pending-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: pendingId, role: "user", content: text, createdAt: new Date().toISOString(), sources: [] }
      ]);
      setSending(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text, model }),
          signal: controller.signal
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to send message");
        }
        const body = (await res.json()) as {
          userMessage: ChatMessage;
          assistantMessage?: ChatMessage;
          stopped?: boolean;
        };
        setMessages((prev) => {
          const withoutPending = prev.filter((message) => message.id !== pendingId);
          return body.assistantMessage
            ? [...withoutPending, body.userMessage, body.assistantMessage]
            : [...withoutPending, body.userMessage];
        });
        loadSessions();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          toast.info("Stopped generating");
        } else {
          toast.error(err instanceof Error ? err.message : "Something went wrong");
          setMessages((prev) => prev.filter((message) => message.id !== pendingId));
        }
      } finally {
        setSending(false);
        abortControllerRef.current = null;
      }
    },
    [activeId, loadSessions, model]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSourceClick = useCallback((path: string) => {
    setSourcePath(path);
  }, []);

  const handleCloseSource = useCallback(() => {
    setSourcePath(null);
  }, []);

  return (
    <div className="flex h-screen">
      <div
        className={cn(
          "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
          sidebarOpen ? "w-72" : "w-0"
        )}
      >
        <SessionSidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={loadSession}
          onNew={handleNew}
          onDelete={handleDelete}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-screen">
          <ResizablePanel minSize={360}>
            <div className="relative flex h-full min-h-0 flex-col bg-background">
              {!sidebarOpen && (
                <div className="absolute top-3 left-3 z-10">
                  <Button
                    onClick={() => setSidebarOpen(true)}
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                    title="Expand sidebar"
                  >
                    <PanelLeftOpen className="size-4" />
                  </Button>
                </div>
              )}
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
                  <h1 className="text-center text-3xl font-semibold tracking-tight text-foreground">
                    What do you want to know?
                  </h1>
                  <div className="w-full max-w-2xl">
                    <MessageInput
                      onSend={handleSend}
                      onStop={handleStop}
                      sending={sending}
                      autoFocus
                      models={models}
                      model={model}
                      onModelChange={setModel}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
                      {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} onSourceClick={handleSourceClick} />
                      ))}
                      {sending && <ThinkingIndicator />}
                    </div>
                  </ScrollArea>
                  <div className="px-6 pb-6">
                    <div className="mx-auto max-w-3xl">
                      <MessageInput
                        onSend={handleSend}
                        onStop={handleStop}
                        sending={sending}
                        models={models}
                        model={model}
                        onModelChange={setModel}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>
          {sourcePath && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={420} minSize={320} maxSize={720}>
                <SourcePanel sourcePath={sourcePath} onClose={handleCloseSource} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
