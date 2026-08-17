import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";

export async function GET() {
  const config = await getConfig();
  const models = config.chat.availableChatModels?.length
    ? config.chat.availableChatModels
    : [config.chat.chatModel];

  return NextResponse.json({ models, defaultModel: config.chat.chatModel });
}
