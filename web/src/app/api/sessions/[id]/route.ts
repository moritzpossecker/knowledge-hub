import { NextResponse } from "next/server";
import { deleteSession, getSession } from "@/src/lib/server/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteSession(id);
  return NextResponse.json({ ok: true });
}
