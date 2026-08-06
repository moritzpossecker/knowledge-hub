#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runChat } from "./chat.js";
import { runIngest, runCollectionCheck } from "./ingest.js";
import { runInit } from "./init.js";
import { error, header, success } from "./ui.js";

const program = new Command();

program
  .name("knowledge-hub")
  .description("Search and chat with your documentation")
  .summary("Knowledge Hub indexes Markdown documentation with Ollama and Qdrant, then makes it available for grounded chat.")
  .hook("preAction", (thisCommand, actionCommand) => {
    header(process.stdout, actionCommand.name(), actionCommand.description());
  });

program
  .command("init")
  .description("Interactively create or update .env")
  .action(async () => {
    await runInit(process.stdin, process.stdout);
  });

program
  .command("ingest")
  .argument("[path-or-git-url]", "Markdown root or Git URL")
  .description("Ingest markdown docs and run collection check afterwards")
  .action(async (pathOrGitUrl?: string) => {
    const config = await loadConfig(".env");
    if (pathOrGitUrl) {
      config.markdownRoot = pathOrGitUrl;
    }
    const stats = await runIngest(config, process.stdout);
    success(process.stdout, `Indexed ${stats.files} files and ${stats.chunks} chunks.`);
    await runCollectionCheck(config, true, 1, process.stdout);
  });

program
  .command("chat")
  .description("Chat with indexed markdown docs")
  .action(async () => {
    const config = await loadConfig(".env");
    await runChat(config, process.stdin, process.stdout);
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  error(process.stderr, err);
  process.exit(1);
}
