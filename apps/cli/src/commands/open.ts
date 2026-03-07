import { Command } from "commander";
import { execFile } from "node:child_process";
import { getDocumentUrl } from "../api/client.js";

export const openCmd = new Command("open")
  .description("Open a document in the browser")
  .argument("<id>", "Document ID")
  .action((id: string) => {
    const url = getDocumentUrl(id);
    console.log(`Opening ${url}`);

    const platform = process.platform;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    execFile(cmd, [url]);
  });
