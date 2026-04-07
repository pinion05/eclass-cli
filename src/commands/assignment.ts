import { Command } from 'commander';
import type { AssignmentService } from '../domain/services/assignment-service.js';
import { printAssignments, printSubmissionResult, printAssignmentDetail, outputJson } from '../output/formatters.js';

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
    .command('show <seq>')
    .description('과제 상세 조회')
    .option('--json', 'JSON 출력')
    .action(async (seq, opts) => {
      const detail = await assignmentService.getAssignmentDetail(seq);
      if (opts.json) outputJson(detail);
      else printAssignmentDetail(detail);
    });

  assignment
    .command('submit <seq>')
    .description('과제 제출')
    .option('-f, --file <paths...>', '제출할 파일 경로 (여러 개 가능)')
    .option('-i, --image <paths...>', '이미지 파일 경로 (여러 개 가능)')
    .action(async (seq, opts) => {
      const result = await assignmentService.submit(seq, {
        files: opts.file,
        images: opts.image,
      });
      printSubmissionResult(result);
    });
}
