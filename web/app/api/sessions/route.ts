import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/server/store";

export async function GET() {
  return NextResponse.json(listSessions());
}

export async function POST() {
  const session = createSession();
  return NextResponse.json(session, { status: 201 });
}
