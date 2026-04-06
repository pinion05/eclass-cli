import { Command } from 'commander';
import type { AssignmentService } from '../domain/services/assignment-service.js';
import { printAssignments, printSubmissionResult, outputJson } from '../output/formatters.js';

export function registerAssignment(program: Command, assignmentService: AssignmentService) {
  const assignment = program.command('assignment').description('과제 관리');

  assignment
    .command('ls')
    .description('과제 목록')
    .option('--course <course>', '과목명 필터링')
    .option('--json', 'JSON 출력')
    .action(async (opts) => {
      const items = await assignmentService.listAssignments(opts.course);
      if (opts.json) outputJson(items);
      else printAssignments(items);
    });

  assignment
    .command('submit <seq>')
    .description('과제 제출')
    .requiredOption('-f, --file <path>', '제출할 파일 경로')
    .option('-i, --image <path>', '이미지 파일 경로')
    .action(async (seq, opts) => {
      const result = await assignmentService.submit(seq, { file: opts.file, image: opts.image });
      printSubmissionResult(result);
    });
}
