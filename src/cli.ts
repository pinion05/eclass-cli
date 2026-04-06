#!/usr/bin/env node
import { Command } from 'commander';
import { createAppContext } from './runtime/create-app-context.js';
import { registerCourse } from './commands/course.js';
import { registerAssignment } from './commands/assignment.js';
import { registerMaterial } from './commands/material.js';

const program = new Command();
program
  .name('eclass')
  .description('CLI-first 한국공학대학교 e-Class client')
  .version('0.1.0');

async function main() {
  const ctx = await createAppContext();

  registerCourse(program, ctx.courseService);
  registerAssignment(program, ctx.assignmentService);
  registerMaterial(program, ctx.materialService);

  await program.parseAsync(process.argv);

  await ctx.browser.close();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
