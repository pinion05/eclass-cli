import * as cheerio from 'cheerio';
import type { BrowserClient } from '../../transports/browser-client.js';
import type { EclassConfig } from '../../config/config.js';
import { AssignmentSchema, SubmissionResultSchema } from '../models.js';
import type { Assignment, SubmissionResult } from '../models.js';

const BASE_URL = 'https://eclass.tukorea.ac.kr';

export class AssignmentService {
  constructor(
    private client: BrowserClient,
    private config: EclassConfig,
  ) {}

  async listAssignments(courseFilter?: string): Promise<Assignment[]> {
    const html = await this.client.postHtml(
      `${BASE_URL}/ilos/mp/todo_list.acl`,
      {
        todoKjList: '',
        chk_cate: 'ALL',
        encoding: 'utf-8',
      },
    );
    const $ = cheerio.load(html);
    const assignments: Assignment[] = [];
    const now = new Date();

    $('.todo_wrap').each((_, el) => {
      const $el = $(el);

      const course = $el.find('.todo_subjt').text().trim();
      const title = $el.find('.todo_title').text().trim();
      const dDay = $el.find('.todo_d_day').text().trim();
      // deadline: second .todo_date span (the actual date, not the D-day container)
      const deadline = $el.find('.todo_date').last().text().trim().replace(/\s+/g, ' ').trim();

      // hidden inputs에서 gubun과 kj 추출 (id 속성 사용)
      const gubunInput = $el.find('input[id^="gubun_"]').val() as string | undefined;
      const kjInput = $el.find('input[id^="kj_"]').val() as string | undefined;

      // goLecture() onclick에서 kjkey, seq, category 추출
      // goLecture('KJKEY','SEQ','CATEGORY')
      const onclickAttr = $el.attr('onclick') || $el.find('[onclick*="goLecture"]').attr('onclick');
      const goMatch = onclickAttr?.match(/goLecture\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/);
      const seq = goMatch?.[2] ?? '';

      if (!course || !title) return;

      // 카테고리 매핑
      let category: 'report' | 'test' | 'lecture_weeks' | 'project';
      const gubun = gubunInput?.toLowerCase() ?? '';
      if (gubun.includes('report')) {
        category = 'report';
      } else if (gubun.includes('test') || gubun.includes('quiz')) {
        category = 'test';
      } else if (gubun.includes('project')) {
        category = 'project';
      } else {
        category = 'lecture_weeks';
      }

      // 마감일 파싱 → 상태 결정
      let status: '진행중' | '종료' = '진행중';
      if (deadline) {
        try {
          // "2026.04.08 오후 11:59" → parse
          const deadlineDate = new Date(deadline.replace(/\./g, '-'));
          if (deadlineDate < now) {
            status = '종료';
          }
        } catch {
          // 날짜 파싱 실패 시 기본값 유지
        }
      }

      assignments.push({
        title,
        course,
        category,
        dDay,
        deadline,
        status,
        kjkey: kjInput ?? '',
        seq,
      });
    });

    let result = AssignmentSchema.array().parse(assignments);

    if (courseFilter) {
      const lowerFilter = courseFilter.toLowerCase();
      result = result.filter((a) => a.course.toLowerCase().includes(lowerFilter));
    }

    return result;
  }

  async submit(seq: string, options: { file?: string; image?: string }): Promise<SubmissionResult> {
    // 1. 과제 상세 페이지 이동
    const detailHtml = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/report_view_form.acl?RT_SEQ=${seq}`,
    );
    const $ = cheerio.load(detailHtml);

    // 2. hidden inputs 추출
    const KJ_YEAR = $('input[name="KJ_YEAR"]').val() as string || '';
    const KJ_TERM = $('input[name="KJ_TERM"]').val() as string || '';
    const KJ_KEY = $('input[name="KJ_KEY"]').val() as string || '';
    const RT_SEQ = $('input[name="RT_SEQ"]').val() as string || seq;
    const CONTENT_SEQ = $('input[name="CONTENT_SEQ"]').val() as string || '';
    const ud = $('input[name="ud"]').val() as string || this.config.id;

    // 3. 본문 입력 (null 방지)
    const page = this.client.getPage();
    await page.evaluate((content) => {
      const textarea = document.querySelector('textarea[name="CONTENT"]')
        || document.querySelector('textarea')
        || document.querySelector('#CONTENT');
      if (textarea) {
        (textarea as HTMLTextAreaElement).value = content;
      }
    }, this.config.id);

    // 4. 파일 업로드 (file 옵션이 있을 때)
    const uploadedFiles: string[] = [];
    if (options.file) {
      const uploadResult = await this.client.uploadFiles(
        `${BASE_URL}/ilos/co/efile_upload_multiple2.acl`,
        [options.file],
        {
          path: 'K006',
          ud: this.config.id,
          ky: KJ_KEY,
          pf_st_flag: '2',
        },
      );
      // 업로드 결과에서 파일명 추출
      uploadedFiles.push(options.file.split('/').pop() || options.file);
    }
    if (options.image) {
      const uploadResult = await this.client.uploadFiles(
        `${BASE_URL}/ilos/co/efile_upload_multiple2.acl`,
        [options.image],
        {
          path: 'K006',
          ud: this.config.id,
          ky: KJ_KEY,
          pf_st_flag: '2',
        },
      );
      uploadedFiles.push(options.image.split('/').pop() || options.image);
    }

    // 5. 저장 요청 (form submit)
    await page.evaluate((params) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/ilos/st/course/report_submit_form.acl';

      for (const [key, value] of Object.entries(params)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      // CONTENT textarea 값 추가
      const textarea = document.querySelector('textarea[name="CONTENT"]')
        || document.querySelector('textarea');
      if (textarea) {
        const contentInput = document.createElement('input');
        contentInput.type = 'hidden';
        contentInput.name = 'CONTENT';
        contentInput.value = (textarea as HTMLTextAreaElement).value;
        form.appendChild(contentInput);
      }

      document.body.appendChild(form);
      form.submit();
    }, { KJ_YEAR, KJ_TERM, KJ_KEY, RT_SEQ, CONTENT_SEQ, ud });

    // 6. 제출 후 재확인 (페이지 로딩 대기)
    await page.waitForLoadState('domcontentloaded');
    const resultHtml = await page.content();
    const $result = cheerio.load(resultHtml);

    // 제출된 파일 목록 파싱
    const submittedFiles: string[] = [...uploadedFiles];
    $result('.file-list a, .uploaded-file a, [class*="file"] a').each((_, el) => {
      const fileName = $result(el).text().trim();
      if (fileName && !submittedFiles.includes(fileName)) {
        submittedFiles.push(fileName);
      }
    });

    const submittedAt = new Date().toISOString();

    return SubmissionResultSchema.parse({
      success: true,
      message: '과제가 성공적으로 제출되었습니다.',
      submittedFiles,
      submittedAt,
    });
  }
}
