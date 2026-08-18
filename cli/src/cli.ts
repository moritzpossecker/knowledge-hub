#!/usr/bin/env node

import { Command } from "commander";
import { runSync } from "./sync/sync.js";
import { runUpdateConfig } from "./config/updateConfig.js";
import { loadConfig } from "./config/config.js";
import { runChat } from "./chat/chat.js";
import { runCollectionCheck } from "./checks/collectionCheck.js";
import { error, header, success } from "./ui.js";
import { runWeb } from "./web.js";

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
  .description("Create or update config.json")
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
  .option("-p, --prune", "Prune deleted files from the index")
  .option("-r, --recreate", "Recreate the index, removing all existing data and re-indexing all files")
  .description("Syncs markdown docs and runs collection-check afterwards")
  .action(async (pathOrGitUrl: string | undefined, options) => {
    const config = await loadConfig(process.stdout);
    if (pathOrGitUrl) {
      config.sync.markdownRootPath = pathOrGitUrl;
    }
    const stats = await runSync(
      config,
      options.prune || false,
      options.recreate || false,
      process.stdout,
      process.stdin
    );
    success(process.stdout, `Indexed ${stats.files} files and ${stats.chunks} chunks.`);
    await runCollectionCheck(config, 1, process.stdin, process.stdout);
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
    const stats = await runSync(config, false, false, process.stdout, process.stdin);
    success(process.stdout, `Indexed ${stats.files} files and ${stats.chunks} chunks.`);
    await runCollectionCheck(config, 1, process.stdin, process.stdout);
  });

program
  .command("chat")
  .description("Chat with indexed markdown docs")
  .action(async () => {
    const config = await loadConfig(process.stdout);
    await runChat(config, process.stdin, process.stdout);
  });

program
  .command("collection-check")
  .description("Check the status of the Qdrant collection")
  .option("-s, --samples <number>", "The number of sample points to display", "0")
  .aliases(["cc"])
  .action(async (options) => {
    const config = await loadConfig(process.stdout);
    await runCollectionCheck(config, parseInt(options.samples), process.stdin, process.stdout);
  });

program
  .command("web")
  .description("Start and open the web interface in Docker")
  .action(async () => {
    await runWeb(process.stdout);
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  error(process.stderr, err);
  process.exit(1);
}
