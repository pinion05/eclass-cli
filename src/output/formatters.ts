import type { Course, Assignment, Material, CourseDetail, SubmissionResult, AssignmentDetail } from '../domain/models.js';

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
    seq: a.seq,
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

export function printAssignmentDetail(detail: AssignmentDetail): void {
  console.log(`# ${detail.title}`);
  console.log(`제출방식: ${detail.submissionType}`);
  console.log(`게시일: ${detail.publishDate}`);
  console.log(`마감일: ${detail.deadline}`);
  console.log(`배점: ${detail.points}`);
  console.log(`지각제출: ${detail.lateSubmission}`);
  console.log(`점수공개: ${detail.scoreVisibility}`);
  if (detail.scoreOpenStart) {
    console.log(`  공개시작: ${detail.scoreOpenStart}`);
    console.log(`  공개마감: ${detail.scoreOpenEnd ?? '무제한'}`);
  }

  if (detail.contentImages.length > 0) {
    console.log(`\n본문 이미지:`);
    detail.contentImages.forEach((img, i) => {
      console.log(`  [${i + 1}] ${img.alt ? `${img.alt} — ` : ''}${img.src}`);
    });
  }

  if (detail.attachments.length > 0) {
    console.log(`\n첨부파일:`);
    detail.attachments.forEach(a => console.log(`  - ${a.name} (${a.url})`));
  }

  // 본문 내용 (태그 제거한 텍스트, 줄바꿈 보존)
  const contentText = detail.content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  console.log(`\n내용:\n${contentText}`);
}
