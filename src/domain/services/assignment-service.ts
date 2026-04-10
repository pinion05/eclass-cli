import * as cheerio from 'cheerio';
import type { BrowserClient } from '../../transports/browser-client.js';
import type { EclassConfig } from '../../config/config.js';
import { AssignmentSchema, SubmissionResultSchema, AssignmentDetailSchema } from '../models.js';
import type { Assignment, SubmissionResult, AssignmentDetail } from '../models.js';
import { CourseService } from './course-service.js';

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

export function combineSeqCsv(...values: Array<string | null | undefined>): string {
  const merged = values
    .flatMap((value) => (value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(merged)).join(',');
}

export function normalizeEditorImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      const match = trimmed.match(/^https?:\/\/[^/]+(\/.*)$/i);
      return match?.[1] ?? trimmed;
    }
  }

  return trimmed;
}

export function extractEditorImageId(src: string): string {
  const normalized = normalizeEditorImageSrc(src);
  const basename = normalized.split('/').pop() ?? '';
  return basename.replace(/\.[^.]+$/, '');
}

export function extractContentSeqFromUpdateScript(scriptSource: string): string | null {
  const match = scriptSource.match(/CONTENT_SEQ\s*:\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

export function parseReportAssignmentsFromListHtml(
  html: string,
  fallbackCourse: string,
  fallbackKjkey: string,
): Assignment[] {
  const $ = cheerio.load(html);
  const assignments: Assignment[] = [];

  $('tr.list').each((_, el) => {
    const $row = $(el);
    const title = $row.find('.subjt_top').first().text().trim();
    const onclick = $row.find('[onclick*="report_view_form.acl"]').first().attr('onclick')
      || $row.attr('onclick')
      || '';
    const seq = onclick.match(/RT_SEQ=(\d+)/)?.[1] ?? '';
    const cells = $row.find('td');
    const statusText = cells.eq(3).text().trim();
    const deadline = cells.last().text().trim().replace(/\s+/g, ' ');

    if (!title || !seq) {
      return;
    }

    assignments.push({
      title,
      course: fallbackCourse,
      category: 'report',
      dDay: '',
      deadline,
      status: statusText.includes('종료') ? '종료' : '진행중',
      kjkey: fallbackKjkey,
      seq,
    });
  });

  return AssignmentSchema.array().parse(assignments);
}

export function mergeAssignmentsBySeq(primary: Assignment[], fallback: Assignment[]): Assignment[] {
  const merged = new Map<string, Assignment>();

  for (const item of fallback) {
    merged.set(item.seq, item);
  }

  for (const item of primary) {
    const existing = merged.get(item.seq);
    if (!existing) {
      merged.set(item.seq, item);
      continue;
    }

    merged.set(item.seq, {
      ...existing,
      ...item,
      dDay: item.dDay || existing.dDay,
      deadline: item.deadline || existing.deadline,
      kjkey: item.kjkey || existing.kjkey,
    });
  }

  return Array.from(merged.values());
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
      const deadline = $el.find('.todo_date').last().text().trim().replace(/\s+/g, ' ').trim();

      const gubunInput = $el.find('input[id^="gubun_"]').val() as string | undefined;
      const kjInput = $el.find('input[id^="kj_"]').val() as string | undefined;

      const onclickAttr = $el.attr('onclick') || $el.find('[onclick*="goLecture"]').attr('onclick');
      const goMatch = onclickAttr?.match(/goLecture\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/);
      const seq = goMatch?.[2] ?? '';

      if (!course || !title) return;

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
    const reportAssignments = await this.listReportAssignments(courseFilter);
    result = mergeAssignmentsBySeq(result, reportAssignments);

    if (courseFilter) {
      const lowerFilter = courseFilter.toLowerCase();
      result = result.filter((a) => a.course.toLowerCase().includes(lowerFilter));
    }

    return result;
  }

  private async listReportAssignments(courseFilter?: string): Promise<Assignment[]> {
    const courseService = new CourseService(this.client);
    const courses = await courseService.listCourses();
    const lowerFilter = courseFilter?.toLowerCase();
    const targetCourses = lowerFilter
      ? courses.filter((course) => course.name.toLowerCase().includes(lowerFilter))
      : courses;
    const reportAssignments: Assignment[] = [];

    for (const course of targetCourses) {
      await this.client.enterCourseRoom(course.kjkey);
      const reportHtml = await this.client.getHtml(
        `${BASE_URL}/ilos/st/course/report_list_form.acl?acl=report_list_form.acl&s=menu`,
      );
      reportAssignments.push(...parseReportAssignmentsFromListHtml(reportHtml, course.name, course.kjkey));
    }

    return mergeAssignmentsBySeq([], reportAssignments);
  }

  private async resolveAssignment(seq: string): Promise<Assignment> {
    const assignments = await this.listAssignments();
    const target = assignments.find((assignment) => assignment.seq === seq);
    if (!target) {
      throw new Error(`과제를 찾을 수 없습니다: seq=${seq}`);
    }
    if (!target.kjkey.trim()) {
      throw new Error(`kjkey가 비어 있습니다 (seq=${seq}). submit 전 강의실 진입 컨텍스트가 필요합니다.`);
    }
    return target;
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
    const target = await this.resolveAssignment(seq);

    // 2. 강의실 진입 (kjkey 유효성 검증)
    await this.client.enterCourseRoom(target.kjkey);

    // 3. 과제 상세 페이지 로드
    const html = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/report_view_form.acl?RT_SEQ=${seq}`,
    );
    const $ = cheerio.load(html);

    // 4. table.bbsview 파싱 (존재 검증)
    const $table = $('table.bbsview');
    if ($table.length === 0) {
      throw new Error(
        `과제 상세 페이지에 table.bbsview가 없습니다 (seq=${seq}). ` +
        `접근 권한이 없거나 페이지 로드에 실패했을 수 있습니다. ` +
        `enterCourseRoom이 먼저 호출되었는지 확인하세요.`,
      );
    }
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
    const target = await this.resolveAssignment(seq);

    await this.client.enterCourseRoom(target.kjkey);
    await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/report_view_form.acl?RT_SEQ=${seq}`,
    );

    const page = this.client.getPage();
    await this.dismissDraftDialogs();

    let mode: 'insert' | 'update' = 'insert';
    const updateButton = page.locator('#uptBtn');
    if (await updateButton.count() > 0) {
      mode = 'update';
      await updateButton.first().click({ force: true });
      await page.waitForSelector('#saveBtn', { state: 'visible', timeout: 15000 });
      await this.dismissDraftDialogs();
    }

    const formHtml = await page.content();
    const $ = cheerio.load(formHtml);
    const KJ_KEY = $('input[name="KJ_KEY"]').val() as string || target.kjkey;
    const RT_SEQ = $('input[name="RT_SEQ"]').val() as string || seq;
    let CONTENT_SEQ = $('input[name="CONTENT_SEQ"]').val() as string || '';
    const ud = $('input[name="ud"]').val() as string || this.config.id;

    if (mode === 'update' && !CONTENT_SEQ) {
      const updateScriptSource = await page.evaluate(() => {
        const win = window as any;
        return typeof win.updateGo?.toString === 'function' ? win.updateGo.toString() : '';
      });
      CONTENT_SEQ = extractContentSeqFromUpdateScript(updateScriptSource) ?? '';
    }

    await page.waitForSelector('#submit_div', { state: 'visible', timeout: 10000 });
    if (options.images && options.images.length > 0) {
      await page.waitForSelector('#JR_TXT_image', { state: 'visible', timeout: 10000 });
    }

    await page.evaluate((content) => {
      const textarea = document.querySelector('textarea[name="CONTENT"]')
        || document.querySelector('#JR_TXT')
        || document.querySelector('textarea')
        || document.querySelector('#CONTENT');
      if (textarea) {
        (textarea as HTMLTextAreaElement).value = content;
      }
      const win = window as any;
      if (win.tinymce?.get?.('JR_TXT')) {
        win.tinymce.get('JR_TXT').setContent(content);
        win.tinymce.triggerSave?.();
      }
    }, this.config.id);

    const uploadedFiles: string[] = [];
    const uploadedFileSeqs: string[] = [];
    if (options.files && options.files.length > 0) {
      for (const filePath of options.files) {
        const uploadResponse = await this.client.uploadFiles(
          `${BASE_URL}/ilos/co/efile_upload_multiple2.acl`,
          [filePath],
          {
            path: 'K006',
            ud: this.config.id,
            ky: KJ_KEY,
            pf_st_flag: '2',
          },
        );

        const uploadResult = JSON.parse(uploadResponse) as {
          isError?: boolean;
          seq1?: string;
          message?: string;
        };

        if (uploadResult.isError) {
          throw new Error(uploadResult.message || `파일 업로드에 실패했습니다: ${filePath}`);
        }
        if (uploadResult.seq1) {
          uploadedFileSeqs.push(uploadResult.seq1);
        }
        uploadedFiles.push(filePath.split('/').pop() || filePath);
      }
    }

    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        await this.embedImageInEditor(img);
        uploadedFiles.push(`[이미지] ${img.split('/').pop() || img}`);
      }
    }

    const submitPayload = await page.evaluate(() => {
      const win = window as any;
      win.tinymce?.triggerSave?.();
      const editor = win.tinymce?.get?.('JR_TXT');
      const jrTxt = editor?.getContent?.({ format: 'html' })
        ?? (document.querySelector('#JR_TXT') as HTMLTextAreaElement | null)?.value
        ?? '';

      let editorSeqs = '';
      if (editor?.getBody) {
        const body = editor.getBody();
        const ufiles = Array.from(body.getElementsByClassName('imaxsoftUfiles'));
        editorSeqs = ufiles
          .map((el) => (el instanceof HTMLElement ? el.id : ''))
          .filter(Boolean)
          .join(',');
      }

      return {
        jrTxt,
        editorSeqs,
        existingFileSeqs: typeof win.getFileSeqs === 'function' ? win.getFileSeqs() : '',
        delFileSeqs: typeof win.getDelFileSeqs === 'function' ? win.getDelFileSeqs() : '',
      };
    });

    const submissionResult = await page.evaluate(
      async (params) => {
        const body = new URLSearchParams({
          ud: params.ud,
          ky: params.ky,
          returnData: 'json',
          JR_TXT: params.jrTxt,
          RT_SEQ: params.rtSeq,
          FILE_SEQS: params.fileSeqs,
          EDITOR_SEQS: params.editorSeqs,
          encoding: 'utf-8',
        });

        if (params.mode === 'insert') {
          body.set('start', '');
          body.set('display', '');
        } else {
          body.set('CONTENT_SEQ', params.contentSeq);
          body.set('D_FILE_SEQS', params.delFileSeqs);
        }

        const resp = await fetch(
          params.mode === 'insert' ? '/ilos/st/course/report_insert.acl' : '/ilos/st/course/report_update.acl',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'follow',
          },
        );
        return await resp.json();
      },
      {
        mode,
        ud,
        ky: KJ_KEY,
        rtSeq: RT_SEQ,
        contentSeq: CONTENT_SEQ,
        jrTxt: submitPayload.jrTxt,
        fileSeqs: combineSeqCsv(submitPayload.existingFileSeqs, uploadedFileSeqs.join(',')),
        editorSeqs: submitPayload.editorSeqs,
        delFileSeqs: submitPayload.delFileSeqs,
      },
    ) as {
      isError?: boolean;
      isKjkey?: boolean | string;
      message?: string;
      chSubjtMessage?: string;
      param?: { CONTENT_SEQ?: string };
    };

    if (submissionResult.isError) {
      throw new Error(submissionResult.message || '과제 제출에 실패했습니다.');
    }
    if (!submissionResult.isKjkey || submissionResult.isKjkey === 'false') {
      throw new Error(submissionResult.chSubjtMessage || '과제 제출 후 강의실 접근 상태를 확인할 수 없습니다.');
    }

    const contentSeq = submissionResult.param?.CONTENT_SEQ || CONTENT_SEQ;
    if (contentSeq) {
      await this.client.getHtml(
        `${BASE_URL}/ilos/st/course/report_view_form.acl?CONTENT_SEQ=${contentSeq}&RT_SEQ=${RT_SEQ}&display=&start=&SCH_KEY=&SCH_VALUE=`,
      );
    }

    return SubmissionResultSchema.parse({
      success: true,
      message: submissionResult.message || (mode === 'update' ? '성공적으로 수정되었습니다.' : '과제가 성공적으로 제출되었습니다.'),
      submittedFiles: [...uploadedFiles],
      submittedAt: new Date().toISOString(),
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

    await page.waitForSelector('#JR_TXT_ifr', { state: 'attached', timeout: 10000 }).catch(() => {});
    await page.locator('#JR_TXT_image').waitFor({ state: 'visible', timeout: 10000 });

    await this.dismissDraftDialogs();

    const imageBtn = page.locator('#JR_TXT_image');
    await imageBtn.click({ force: true });
    await page.waitForSelector('div[id^="mce_inlinepopups_"]', { state: 'visible', timeout: 5000 });

    const imageDialogIframe = page.frameLocator('iframe[id^="mce_inlinepopups_"][id$="_ifr"]');
    const browseBtn = imageDialogIframe.locator('#srcbrowser_link, #srcbrowser, a[href^="javascript:openBrowser"], a#srcbrowser_link');
    await browseBtn.first().click({ force: true });
    await page.waitForSelector('iframe[src*="file_upload_pop_form"]', { state: 'attached', timeout: 5000 });

    const uploadPopupIframe = page.frameLocator('iframe[src*="file_upload_pop_form"]');
    const fileInput = uploadPopupIframe.locator('input[type="file"]');
    await fileInput.setInputFiles(imagePath);

    const uploadBtn = uploadPopupIframe.locator('input[type="submit"], button[type="submit"], #btn_upload, .btn_upload');
    if (await uploadBtn.count() > 0) {
      await uploadBtn.first().click();
      await uploadPopupIframe.locator('a[href*="/ilosfiles/editor-file/"], .file_list a, a[id^="file_"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }

    const uploadedFileLink = uploadPopupIframe.locator('a[href*="/ilosfiles/editor-file/"], .file_list a, a[id^="file_"]').first();
    if (await uploadedFileLink.count() > 0) {
      await uploadedFileLink.click();
      await page.waitForFunction(() => {
        const frames = Array.from(document.querySelectorAll('iframe[id^="mce_inlinepopups_"][id$="_ifr"]')) as HTMLIFrameElement[];
        return frames.some((frame) => {
          try {
            const input = frame.contentDocument?.querySelector('#src') as HTMLInputElement | null;
            return Boolean(input?.value);
          } catch {
            return false;
          }
        });
      }, undefined, { timeout: 10000 }).catch(() => {});
    }

    const rawSrc = await imageDialogIframe.locator('#src').inputValue().catch(() => '');
    const normalizedSrc = normalizeEditorImageSrc(rawSrc);
    const imageId = extractEditorImageId(normalizedSrc);

    const insertBtn = imageDialogIframe.locator('#insert');
    await insertBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);

    const normalized = await page.evaluate(({ src, id }) => {
      const win = window as any;
      const editor = win.tinymce?.get?.('JR_TXT');
      const body = editor?.getBody?.();
      if (!body) return false;

      const images = Array.from(body.querySelectorAll('img')) as HTMLImageElement[];
      const target = images.find((img) => {
        const currentSrc = img.getAttribute('src') || '';
        return currentSrc === src || currentSrc.endsWith(src);
      });

      if (!(target instanceof HTMLImageElement)) {
        return false;
      }

      target.setAttribute('src', src);
      target.setAttribute('class', 'imaxsoftUfiles');
      if (!target.id) {
        target.id = id;
      }
      win.tinymce?.triggerSave?.();
      return true;
    }, { src: normalizedSrc, id: imageId });

    if (!normalized && normalizedSrc && imageId) {
      await page.evaluate(({ src, id }) => {
        const win = window as any;
        const editor = win.tinymce?.get?.('JR_TXT');
        if (!editor) return;
        const current = editor.getContent({ format: 'html' }) || '';
        if (current.includes(src)) return;
        editor.setContent(`${current}\n<p><img class="imaxsoftUfiles" id="${id}" alt="" src="${src}" /></p>`);
        win.tinymce?.triggerSave?.();
      }, { src: normalizedSrc, id: imageId });
    }
  }

  private async dismissDraftDialogs(): Promise<void> {
    const page = this.client.getPage();

    for (let i = 0; i < 6; i++) {
      const handled = await page.evaluate(() => {
        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const buttons = Array.from(document.querySelectorAll('button, .ui-button'));
        const findButton = (label: string) => {
          return buttons.find((el) => isVisible(el) && (el.textContent || '').replace(/\s+/g, '').includes(label));
        };

        const deleteDraftBtn = findButton('아니오(삭제)');
        if (deleteDraftBtn instanceof HTMLElement) {
          deleteDraftBtn.click();
          return true;
        }

        const visibleDialogs = Array.from(document.querySelectorAll('.ui-dialog, .ui-dialog-form'))
          .filter(isVisible)
          .map((el) => (el.textContent || '').replace(/\s+/g, ''));

        if (visibleDialogs.some((text) => text.includes('삭제하시겠습니까'))) {
          const yesBtn = findButton('네');
          if (yesBtn instanceof HTMLElement) {
            yesBtn.click();
            return true;
          }
        }

        return false;
      });

      if (!handled) break;
      await page.waitForTimeout(500);
    }
  }
}
