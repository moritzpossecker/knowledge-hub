import { NextResponse } from "next/server";
import { askQuestion } from "@/lib/server/chat";
import { getQdrantClient } from "@/lib/server/qdrant";
import { addMessage, getSession } from "@/lib/server/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const userMessage = addMessage(id, "user", question);

  const { qdrant, config } = await getQdrantClient();
  try {
    const { answer, sources } = await askQuestion(qdrant, config, question, req.signal);
    const assistantMessage = addMessage(id, "assistant", answer, sources);
    return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
  } catch (err) {
    if (req.signal.aborted) {
      return NextResponse.json({ userMessage, stopped: true }, { status: 200 });
    }
    throw err;
  }
}
