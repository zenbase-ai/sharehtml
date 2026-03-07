import { Command } from "commander";
import { deleteDocument } from "../api/client.js";

export const deleteCmd = new Command("delete")
  .alias("rm")
  .description("Delete a document")
  .argument("<id>", "Document ID")
  .action(async (id: string) => {
    try {
      await deleteDocument(id);
      console.log(`Deleted document ${id}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
