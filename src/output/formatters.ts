import type { Course, Assignment, Material, CourseDetail, SubmissionResult } from '../domain/models.js';

export function outputJson<T>(data: T): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printCourses(courses: Course[]): void {
  console.table(courses.map(c => ({
    강의명: c.name,
    교수: c.professor,
    시간: c.time,
  })));
}

export function printAssignments(assignments: Assignment[]): void {
  console.table(assignments.map(a => ({
    과목: a.course,
    카테고리: a.category,
    제목: a.title,
    'D-day': a.dDay,
    마감일: a.deadline,
    상태: a.status,
  })));
}

export function printMaterials(materials: Material[]): void {
  console.table(materials.map(m => ({
    제목: m.title,
    작성자: m.author,
    조회수: m.views,
    공개일: m.publishDate,
    첨부: m.hasAttachment ? '✓' : '-',
    읽음: m.isRead ? '✓' : '○',
  })));
}

export function printCourseDetail(detail: CourseDetail): void {
  console.log(`# ${detail.name}`);
  console.log(`교수: ${detail.professor}`);
  if (detail.email) console.log(`이메일: ${detail.email}`);
  console.log(`시간: ${detail.time}`);
  console.log(`학점: ${detail.credits}`);
  if (detail.overview) console.log(`\n## 개요\n${detail.overview}`);
  if (detail.grading) console.log(`\n## 평가방법\n${detail.grading}`);
  if (detail.weeklyPlan.length > 0) {
    console.log('\n## 주차별 계획');
    console.table(detail.weeklyPlan);
  }
}

export function printSubmissionResult(result: SubmissionResult): void {
  if (result.success) {
    console.log(`✅ ${result.message}`);
    console.log(`제출 시각: ${result.submittedAt}`);
    if (result.submittedFiles.length > 0) {
      console.log('제출된 파일:');
      result.submittedFiles.forEach(f => console.log(`  - ${f}`));
    }
  } else {
    console.error(`❌ ${result.message}`);
  }
}
