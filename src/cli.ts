#!/usr/bin/env node

import { Command } from "commander";
import { runSync, runCollectionCheck } from "./sync/sync.js";
import { error, header, success } from "./ui.js";
import { runUpdateConfig } from "./config/updateConfig.js";
import { loadConfig } from "./config/config.js";
import { runChat } from "./chat/chat.js";

const program = new Command();

program
  .name("knowledge-hub")
  .description("Search and chat with your documentation")
  .summary("Knowledge Hub indexes Markdown documentation with Ollama and Qdrant, then makes it available for grounded chat.")
  .hook("preAction", (thisCommand, actionCommand) => {
    header(process.stdout, actionCommand.name(), actionCommand.description());
  });

program
  .command("config")
  .description("Interactively create or update config.json")
  .option("-m, --manual", "Edit config.json manually instead of interactively")
  .option("--setup", "Only configure the setup and connection settings")
  .option("--sync", "Only configure the sync and performance settings")
  .option("--chat", "Only configure the chat and retrieval settings")
  .action(async (options) => {
    await runUpdateConfig(
      options.manual || false,
      options.setup || false,
      options.sync || false,
      options.chat || false,
      process.stdin,
      process.stdout
    );
  });

program
  .command("sync")
  .argument("[path-or-git-url]", "Markdown root or Git URL")
  .description("Ingest markdown docs and run collection check afterwards")
  .action(async (pathOrGitUrl?: string) => {
    const config = await loadConfig(process.stdout);
    if (pathOrGitUrl) {
      config.sync.markdownRootPath = pathOrGitUrl;
    }
    const stats = await runSync(config, process.stdout, process.stdin);
    success(process.stdout, `Indexed ${stats.files} files and ${stats.chunks} chunks.`);
    await runCollectionCheck(config, true, 1, process.stdout);
  });

program
  .command("init")
  .description("Initialize the knowledge hub - runs config and sync")
  .action(async () => {
    await runUpdateConfig(
      false,
      true,
      true,
      true,
      process.stdin,
      process.stdout
    );

    const config = await loadConfig(process.stdout);
    const stats = await runSync(config, process.stdout, process.stdin);
    success(process.stdout, `Indexed ${stats.files} files and ${stats.chunks} chunks.`);
    await runCollectionCheck(config, true, 1, process.stdout); 
  });

program
  .command("chat")
  .description("Chat with indexed markdown docs")
  .action(async () => {
    const config = await loadConfig(process.stdout);
    await runChat(config, process.stdin, process.stdout);
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  error(process.stderr, err);
  process.exit(1);
}
