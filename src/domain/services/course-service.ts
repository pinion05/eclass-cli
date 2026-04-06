import * as cheerio from 'cheerio';
import type { BrowserClient } from '../../transports/browser-client.js';
import { CourseSchema, CourseDetailSchema } from '../models.js';
import type { Course, CourseDetail } from '../models.js';

const BASE_URL = 'https://eclass.tukorea.ac.kr';

export class CourseService {
  constructor(private client: BrowserClient) {}

  async listCourses(): Promise<Course[]> {
    const html = await this.client.getHtml(
      `${BASE_URL}/ilos/mp/course_register_list_form.acl`,
    );
    const $ = cheerio.load(html);
    const courses: Course[] = [];

    // 각 과목 카드/행 순회 (content-container 단위)
    $('.content-container').each((_, el) => {
      const $container = $(el);

      const name = $container.find('.content-title').text().trim();
      const professor = $container.find('.content-author > li:nth-child(1) > span').text().trim();
      const time = $container.find('.content-author > li:nth-child(2) > span').text().trim();

      // kjkey: onclick 속성에서 eclassRoom('KJKEY') 추출
      const onclickAttr = $container.find('a[onclick*="eclassRoom"]').attr('onclick');
      const kjMatch = onclickAttr?.match(/eclassRoom\(['"]([^'"]+)['"]\)/);
      const kjkey = kjMatch?.[1] ?? '';

      if (name && kjkey) {
        courses.push({ name, professor, time, kjkey });
      }
    });

    return CourseSchema.array().parse(courses);
  }

  async getCourseDetail(courseName: string): Promise<CourseDetail> {
    // 1. 과목 목록에서 이름 매칭
    const courses = await this.listCourses();
    const lowerName = courseName.toLowerCase();
    const matched = courses.find((c) => c.name.toLowerCase().includes(lowerName));
    if (!matched) {
      throw new Error(`과목을 찾을 수 없습니다: "${courseName}"`);
    }

    const { kjkey } = matched;

    // 2. 강의실 진입 (세션 확보)
    await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/submain_form.acl?KJKEY=${kjkey}`,
    );

    // 3. 강의계획서 파싱
    const planHtml = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/plan_form.acl?lecture_id=${kjkey}`,
    );
    const $ = cheerio.load(planHtml);

    // 첫 번째 테이블에서 기본 정보 추출
    const firstTable = $('table').first();
    const rows = firstTable.find('tr');

    const getCellText = (row: cheerio.Cheerio<any>, colIndex: number): string => {
      return row.find('td').eq(colIndex).text().trim();
    };

    // 테이블 구조에 따라 유연하게 파싱
    let courseNameParsed = '';
    let professor = '';
    let email: string | null = null;
    let time = '';
    let credits = '';
    let overview: string | null = null;
    let grading: string | null = null;

    rows.each((_i, el) => {
      const $row = $(el);
      const label = $row.find('th').first().text().trim();

      if (label.includes('교과목명') || label.includes('과목명')) {
        courseNameParsed = getCellText($row, label ? 0 : 1);
      } else if (label.includes('교수') || label.includes('담당교수')) {
        const cellText = getCellText($row, 0);
        professor = cellText;
        // E-mail이 같은 셀에 있을 수 있음
        const emailMatch = cellText.match(/([\w.-]+@[\w.-]+\.\w+)/);
        if (emailMatch) {
          email = emailMatch[1];
          professor = cellText.replace(emailMatch[0], '').trim();
        }
      } else if (label.includes('E-mail') || label.includes('이메일')) {
        email = getCellText($row, 0) || null;
      } else if (label.includes('강의시간') || label.includes('수업시간')) {
        time = getCellText($row, 0);
      } else if (label.includes('학점') || label.includes('학점/강의')) {
        credits = getCellText($row, 0);
      } else if (label.includes('교과목개요') || label.includes('개요')) {
        overview = getCellText($row, 0) || null;
      } else if (label.includes('학습평가') || label.includes('평가방법')) {
        grading = getCellText($row, 0) || null;
      }
    });

    // courseNameParsed가 비어있으면 매칭된 이름 사용
    if (!courseNameParsed) {
      courseNameParsed = matched.name;
    }

    // 두 번째 테이블에서 주차별 계획 추출
    const weeklyPlan: { week: string; content: string }[] = [];
    const secondTable = $('table').eq(1);

    if (secondTable.length) {
      secondTable.find('tr').each((_, el) => {
        const $row = $(el);
        // th가 포함된 헤더 행은 건너뛰기
        if ($row.find('th').length > 0) return;

        const cells = $row.find('td');
        if (cells.length >= 2) {
          const week = cells.eq(0).text().trim();
          const content = cells.eq(1).text().trim();
          if (week || content) {
            weeklyPlan.push({ week, content });
          }
        }
      });
    }

    return CourseDetailSchema.parse({
      name: courseNameParsed,
      professor,
      email,
      time,
      credits,
      overview,
      grading,
      weeklyPlan,
      kjkey,
    });
  }
}
