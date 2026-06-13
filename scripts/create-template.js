#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
const pkg = createRequire(import.meta.url)("../package.json");

const program = new Command();
program.name("Propeller CLI").version(pkg.version);

program
    .command("template <name>")
    .description("Creates a Propeller's Project Template")
    .action((name) => scaffold(name));

program.parse();

async function scaffold(name) {
    
}