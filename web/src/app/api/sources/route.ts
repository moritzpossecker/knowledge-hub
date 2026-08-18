import { NextResponse } from "next/server";
import { getQdrantClient } from "@/src/lib/server/qdrant";
import { getSourceDocument } from "@/src/lib/server/sources";

export async function GET(req: Request) {
  const sourcePath = new URL(req.url).searchParams.get("path");
  if (!sourcePath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const { qdrant, config } = await getQdrantClient();
  const doc = await getSourceDocument(qdrant, config.sync.collectionName, sourcePath);
  if (!doc) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }
  return NextResponse.json(doc);
}
