#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program
  .name('eclass')
  .description('CLI-first 한국공학대학교 e-Class client')
  .version('0.1.0')
  .option('--json', 'JSON 출력');

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
