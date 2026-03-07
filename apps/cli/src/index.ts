#!/usr/bin/env bun
import { Command } from "commander";
import { deployCmd } from "./commands/deploy.js";
import { listCmd } from "./commands/list.js";
import { openCmd } from "./commands/open.js";
import { deleteCmd } from "./commands/delete.js";
import { configCmd } from "./commands/config.js";

const program = new Command();

program
  .name("sharehtml")
  .description("Deploy HTML documents with collaborative commenting")
  .version("0.0.1");

program.addCommand(deployCmd);
program.addCommand(listCmd);
program.addCommand(openCmd);
program.addCommand(deleteCmd);
program.addCommand(configCmd);

program.parse();
