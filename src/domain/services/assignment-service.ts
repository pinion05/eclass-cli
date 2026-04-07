import * as cheerio from 'cheerio';
import type { BrowserClient } from '../../transports/browser-client.js';
import type { EclassConfig } from '../../config/config.js';
import { AssignmentSchema, SubmissionResultSchema, AssignmentDetailSchema } from '../models.js';
import type { Assignment, SubmissionResult, AssignmentDetail } from '../models.js';

const BASE_URL = 'https://eclass.tukorea.ac.kr';

/** "2026.04.08 오후 11:59" 형식의 한국어 날짜 문자열을 Date 객체로 파싱 */
function parseKoreanDate(dateStr: string): Date {
  let normalized = dateStr
    .replace(/\./g, '-')
    .replace(/오전\s*/, ' ')
    .replace(/오후\s*/, ' ');

  const match = normalized.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  if (match) {
    const [, datePart, timePart] = match;
    const [year, month, day] = datePart.split('-').map(Number);
    let [hour, minute] = timePart.split(':').map(Number);

    if (dateStr.includes('오후') && hour < 12) hour += 12;
    if (dateStr.includes('오전') && hour === 12) hour = 0;

    return new Date(year, month - 1, day, hour, minute);
  }

  return new Date(dateStr.replace(/\./g, '-'));
}

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
          const deadlineDate = parseKoreanDate(deadline);
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

  /**
   * 과제 상세 정보 조회
   * 
   * 흐름:
   * 1. 과제 목록에서 seq에 해당하는 kjkey 찾기
   * 2. 강의실 진입 (enterCourseRoom)
   * 3. report_view_form.acl 접근
   * 4. table.bbsview 파싱
   */
  async getAssignmentDetail(seq: string): Promise<AssignmentDetail> {
    // 1. 과제 목록에서 kjkey 찾기
    const assignments = await this.listAssignments();
    const target = assignments.find(a => a.seq === seq);
    if (!target) {
      throw new Error(`과제를 찾을 수 없습니다: seq=${seq}`);
    }

    // 2. 강의실 진입
    await this.client.enterCourseRoom(target.kjkey);

    // 3. 과제 상세 페이지 로드
    const html = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/report_view_form.acl?RT_SEQ=${seq}`,
    );
    const $ = cheerio.load(html);

    // 4. table.bbsview 파싱
    const $table = $('table.bbsview');
    const rows = $table.find('tbody > tr');

    // 헬퍼: th 텍스트로 행 찾기
    const findRow = (thText: string) => {
      return rows.filter((_, el) => {
        const th = $(el).find('th').text().trim();
        return th === thText;
      });
    };

    // 제목
    const titleRow = findRow('제목');
    const titleText = titleRow.find('td.first').clone().children().remove().end().text().trim();

    // 제출방식
    const submissionType = findRow('제출방식').find('td').text().trim();

    // 게시일
    const publishDate = findRow('게시일').find('td').text().trim();

    // 마감일
    const deadline = findRow('마감일').find('td').text().trim();

    // 배점
    const points = findRow('배점').find('td').text().trim();

    // 지각제출
    const lateSubmission = findRow('지각제출').find('td').text().trim();

    // 점수공개
    const $scoreRow = findRow('점수공개').find('td');
    const scoreVisibility = $scoreRow.find('div').first().text().trim();
    let scoreOpenStart: string | null = null;
    let scoreOpenEnd: string | null = null;
    if (scoreVisibility === '공개') {
      const startMatch = $scoreRow.text().match(/시작일\s*:\s*([\d.]+\s*(?:오전|오후)\s*\d+:\d+)/);
      scoreOpenStart = startMatch?.[1] ?? null;
      const endMatch = $scoreRow.text().match(/마감일\s*:\s*(무제한|[\d.]+\s*(?:오전|오후)\s*\d+:\d+)/);
      scoreOpenEnd = endMatch?.[1] ?? null;
    }

    // 본문 내용 (textviewer td)
    const $contentTd = $table.find('td.textviewer');
    const $contentDiv = $contentTd.children('div').first();
    const contentHtml = $contentDiv.html() ?? '';
    // 본문 텍스트 (HTML 태그 제거)
    const contentText = $contentDiv.text().trim();

    // 본문 내 이미지 추출
    const contentImages: { src: string; alt: string }[] = [];
    $contentDiv.find('img').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      const alt = $(el).attr('alt') ?? '';
      if (src) {
        contentImages.push({ src: src.startsWith('http') ? src : `${BASE_URL}${src}`, alt });
      }
    });

    // 첨부파일 (div#tbody_file 내 링크)
    const attachments: { name: string; url: string }[] = [];
    $contentTd.find('#tbody_file a').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const name = $(el).text().trim();
      if (name && href) {
        attachments.push({ name, url: href.startsWith('http') ? href : `${BASE_URL}${href}` });
      }
    });

    // hidden inputs
    const kjkey = $('input#KJ_KEY').val() as string || target.kjkey;

    return AssignmentDetailSchema.parse({
      title: titleText,
      submissionType,
      publishDate,
      deadline,
      points,
      lateSubmission,
      scoreVisibility,
      scoreOpenStart,
      scoreOpenEnd,
      content: contentHtml || contentText,
      contentImages,
      attachments,
      seq,
      kjkey,
    });
  }

  async submit(seq: string, options: { files?: string[]; images?: string[] }): Promise<SubmissionResult> {
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

    // 4. 파일 업로드 (files 옵션이 있을 때 — Plupload 첨부파일, 여러 개 지원)
    const uploadedFiles: string[] = [];
    if (options.files && options.files.length > 0) {
      await this.client.uploadFiles(
        `${BASE_URL}/ilos/co/efile_upload_multiple2.acl`,
        options.files,
        {
          path: 'K006',
          ud: this.config.id,
          ky: KJ_KEY,
          pf_st_flag: '2',
        },
      );
      for (const f of options.files) {
        uploadedFiles.push(f.split('/').pop() || f);
      }
    }

    // 5. 이미지 임베딩 (images 옵션이 있을 때 — TinyMCE 에디터에 <img> 인라인 삽입, 여러 개 지원)
    // 흐름: 이미지 버튼 클릭 → 찾아보기 클릭 → 파일 업로드 팝업 → 업로드 → URL 반환 → 삽입
    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        await this.embedImageInEditor(img);
        uploadedFiles.push(`[이미지] ${img.split('/').pop() || img}`);
      }
    }

    // 6. 저장 요청 (form submit)
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

    // 6. 제출 후 결과 페이지에서 성공/실패 판정
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

    // 에러/성공 메시지 확인
    const errorMsg = $result('.alert, .error, .msg_error, [class*="error"]').first().text().trim();
    const successMsg = $result('.msg_ok, [class*="success"], .alert-success').first().text().trim();

    const success = !errorMsg && !!successMsg;
    const message = success ? (successMsg || '과제가 성공적으로 제출되었습니다.') : (errorMsg || '과제 제출에 실패했습니다.');

    const submittedAt = new Date().toISOString();

    return SubmissionResultSchema.parse({
      success,
      message,
      submittedFiles,
      submittedAt,
    });
  }

  /**
   * TinyMCE 에디터에 이미지를 인라인 임베딩
   *
   * 흐름:
   * 1. 에디터 툴바에서 "이미지 삽입/편집" 버튼 클릭 (id=JR_TXT_image)
   * 2. 인라인 팝업(image.htm)에서 "찾아보기" 버튼 클릭 → myFileBrowser()
   * 3. 파일 업로드 팝업(file_upload_pop_form.acl?type=image)에서 파일 업로드
   * 4. 업로드된 이미지 URL이 src 필드에 채워짐
   * 5. "삽입" 버튼 클릭 → <img> 태그가 에디터 본문에 삽입
   */
  private async embedImageInEditor(imagePath: string): Promise<void> {
    const page = this.client.getPage();

    // 1. 이미지 삽입 버튼 클릭
    const imageBtn = page.locator('#JR_TXT_image');
    await imageBtn.click();
    await page.waitForSelector('#mce_inlinepopups_', { state: 'visible', timeout: 5000 });

    // 2. "찾아보기" 버튼 클릭 → 파일 업로드 팝업 열기
    // image.htm iframe 내부에 있음
    const imageDialogIframe = page.frameLocator('iframe[id^="mce_inlinepopups_"][id$="_ifr"]');
    const browseBtn = imageDialogIframe.locator('#src_browser, input[id^="src"][value*="찾아보기"], a[onclick*="myFileBrowser"]');
    await browseBtn.click();
    await page.waitForSelector('iframe[src*="file_upload_pop_form"]', { state: 'attached', timeout: 5000 });

    // 3. 파일 업로드 팝업에서 파일 선택 + 업로드
    // file_upload_pop_form.acl 팝업이 새 인라인 팝업으로 열림
    const uploadPopupIframe = page.frameLocator('iframe[src*="file_upload_pop_form"]');
    const fileInput = uploadPopupIframe.locator('input[type="file"]');
    await fileInput.setInputFiles(imagePath);

    // 업로드 버튼 클릭
    const uploadBtn = uploadPopupIframe.locator('input[type="submit"], button[type="submit"], #btn_upload, .btn_upload');
    if (await uploadBtn.count() > 0) {
      await uploadBtn.first().click();
      await page.waitForTimeout(2000); // 업로드 완료 대기 (iframe 내 네트워크 요청이라 selector 기반 대기 어려움)
    }

    // 4. 업로드 완료 후 파일 목록에서 업로드된 파일 클릭 (URL 선택)
    const uploadedFileLink = uploadPopupIframe.locator('a[href*="/ilosfiles/editor-file/"], .file_list a, a[id^="file_"]').first();
    if (await uploadedFileLink.count() > 0) {
      await uploadedFileLink.click();
      await page.waitForTimeout(1000); // iframe 간 통신 대기
    }

    // 5. image.htm 다이얼로그로 돌아와서 "삽입" 버튼 클릭
    const insertBtn = imageDialogIframe.locator('#insert');
    await insertBtn.click();
  }
}
