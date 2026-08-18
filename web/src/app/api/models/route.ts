import { NextResponse } from "next/server";
import { getConfig } from "@/src/lib/server/config";
import { getAvailableModels } from "@knowledge-hub/core";

export async function GET() {
  const config = await getConfig();
  const models = await getAvailableModels(config.setup.ollama.baseUrl)

  return NextResponse.json({ models, defaultModel: config.chat.chatModel });
}
