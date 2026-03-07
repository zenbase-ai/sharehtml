import { Command } from "commander";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  deployDocument,
  findDocumentByFilename,
  getDocumentUrl,
  updateDocument,
} from "../api/client.js";
import { isMarkdownFile, markdownFilenameToHtml } from "../utils/markdown.js";

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) =>
    rl.question(question + " (y/n) ", (a) => {
      rl.close();
      r(a.trim().toLowerCase() === "y");
    }),
  );
}

export const deployCmd = new Command("deploy")
  .description("Deploy an HTML or Markdown file and get a shareable link")
  .argument("<file>", "Path to HTML or Markdown file")
  .option("-t, --title <title>", "Document title (defaults to filename)")
  .option("-u, --update", "Update existing document without prompting")
  .action(async (file: string, opts: { title?: string; update?: boolean }) => {
    const filePath = resolve(file);

    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        console.error(`Error: ${file} is not a file`);
        process.exit(1);
      }
    } catch {
      console.error(`Error: ${file} not found`);
      process.exit(1);
    }

    try {
      const filename = basename(filePath);
      const lookupFilename = isMarkdownFile(filename)
        ? markdownFilenameToHtml(filename)
        : filename;
      const existing = await findDocumentByFilename(lookupFilename);

      if (existing) {
        const existingUrl = getDocumentUrl(existing.id);

        if (!opts.update) {
          const yes = await confirm(
            `Document '${filename}' already exists at ${existingUrl}. Update it?`,
          );
          if (!yes) {
            console.log("Aborted.");
            return;
          }
        }

        console.log(`Updating ${file}...`);
        const result = await updateDocument(existing.id, filePath, opts.title);
        console.log(`\nUpdated! ${result.url}`);
        console.log(`  id:    ${result.id}`);
        console.log(`  title: ${result.title}`);
        console.log(`  size:  ${(result.size / 1024).toFixed(1)}KB`);
      } else {
        console.log(`Deploying ${file}...`);
        const result = await deployDocument(filePath, opts.title);
        console.log(`\nDeployed! ${result.url}`);
        console.log(`  id:    ${result.id}`);
        console.log(`  title: ${result.title}`);
        console.log(`  size:  ${(result.size / 1024).toFixed(1)}KB`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
