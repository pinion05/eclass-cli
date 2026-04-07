import { Command } from 'commander';
import type { CourseService } from '../domain/services/course-service.js';
import { printCourses, printCourseDetail, outputJson } from '../output/formatters.js';

export function registerCourse(program: Command, courseService: CourseService) {
  const course = program.command('course').description('수강과목 관리');

  course
    .command('ls')
    .description('수강과목 목록')
    .option('--json', 'JSON 출력')
    .action(async (opts) => {
      const courses = await courseService.listCourses();
      if (opts.json) outputJson(courses);
      else printCourses(courses);
    });

  course
    .command('show <name>')
    .description('과목 상세 (교수정보 포함)')
    .option('--json', 'JSON 출력')
    .action(async (name, opts) => {
      const detail = await courseService.getCourseDetail(name);
      if (opts.json) outputJson(detail);
      else printCourseDetail(detail);
    });
}
