import { Command } from "commander";
import { setConfig, getConfig } from "../config/store.js";

export const configCmd = new Command("config").description("Configure the CLI");

configCmd
  .command("set-url <url>")
  .description("Set the worker URL")
  .action((url: string) => {
    setConfig("workerUrl", url.replace(/\/$/, ""));
    console.log(`Worker URL set to: ${url}`);
  });

configCmd
  .command("set-key <key>")
  .description("Set the API key")
  .action((key: string) => {
    setConfig("apiKey", key);
    console.log("API key set.");
  });

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const c = getConfig();
    console.log(`Worker URL: ${c.workerUrl || "(not set)"}`);
    console.log(`API key:    ${c.apiKey ? "****" + c.apiKey.slice(-4) : "(not set)"}`);
  });

configCmd
  .command("init")
  .description("Set up worker URL and API key interactively")
  .action(async () => {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

    const url = await ask("Worker URL: ");
    if (url.trim()) setConfig("workerUrl", url.trim().replace(/\/$/, ""));

    const key = await ask("API key: ");
    if (key.trim()) setConfig("apiKey", key.trim());

    rl.close();
    console.log("\nConfiguration saved.");
  });
