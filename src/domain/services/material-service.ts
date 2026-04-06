import * as cheerio from 'cheerio';
import { basename, resolve } from 'path';
import type { BrowserClient } from '../../transports/browser-client.js';
import type { CourseService } from './course-service.js';
import { MaterialSchema } from '../models.js';
import type { Material } from '../models.js';

const BASE_URL = 'https://eclass.tukorea.ac.kr';

export class MaterialService {
  constructor(
    private client: BrowserClient,
    private courseService: CourseService,
  ) {}

  async listMaterials(courseName: string): Promise<Material[]> {
    // 1. CourseService에서 courseName으로 KJKEY 찾기
    const courses = await this.courseService.listCourses();
    const lowerName = courseName.toLowerCase();
    const matched = courses.find((c) => c.name.toLowerCase().includes(lowerName));
    if (!matched) {
      throw new Error(`과목을 찾을 수 없습니다: "${courseName}"`);
    }

    const { kjkey } = matched;

    // 2. 강의실 진입 (eclassRoom JS 호출)
    await this.client.enterCourseRoom(kjkey);

    // 3. 강의자료 페이지
    const html = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/lecture_material_list_form.acl`,
    );
    const $ = cheerio.load(html);
    const materials: Material[] = [];

    // 각 강의자료 행 순회
    // 일반적으로 목록의 각 항목이 tr 또는 div 구조
    $('tr').each((_, el) => {
      const $row = $(el);

      // 제목이 있는 행인지 확인
      const titleEl = $row.find('.subjt_top');
      if (titleEl.length === 0) return;

      const title = titleEl.text().trim();
      if (!title) return;

      // 작성자/조회수
      const bottomText = $row.find('.subjt_bottom').text().trim();
      // "작성자  조회 N" 형태 파싱
      const viewsMatch = bottomText.match(/조회\s*(\d+)/);
      const views = viewsMatch ? parseInt(viewsMatch[1], 10) : 0;
      const author = bottomText.replace(/조회\s*\d+/, '').trim();

      // 공개일 (날짜 컬럼)
      const publishDate = $row.find('td').last().text().trim()
        || $row.find('[class*="date"]').text().trim()
        || '';

      // 첨부파일 여부
      const hasAttachment = $row.find('.download_icon').length > 0;

      // 읽음 여부
      const isRead = $row.find('.unread_article').length === 0;

      // ARTL_NUM 추출: pageMove(...) onclick
      const onclickAttr = $row.find('[onclick*="pageMove"]').attr('onclick');
      const artlMatch = onclickAttr?.match(/pageMove\([^)]*ARTL_NUM\s*=\s*['"]?([^'")\s]+)/i);
      const artlNum = artlMatch?.[1] ?? '';

      if (artlNum) {
        materials.push({
          title,
          author,
          views,
          publishDate,
          hasAttachment,
          isRead,
          artlNum,
        });
      }
    });

    return MaterialSchema.array().parse(materials);
  }

  async download(artlNum: string, outputPath?: string): Promise<string> {
    // 1. 상세 페이지
    const detailHtml = await this.client.getHtml(
      `${BASE_URL}/ilos/st/course/lecture_material_view_form.acl?ARTL_NUM=${artlNum}`,
    );
    const $ = cheerio.load(detailHtml);

    // 2. FILE_GROUP_ID 추출 (downloadClick 함수 인자)
    const onclickAttr = $('[onclick*="downloadClick"]').attr('onclick');
    const fileGroupMatch = onclickAttr?.match(/downloadClick\(['"]?([^'")\s]+)/);
    const FILE_GROUP_ID = fileGroupMatch?.[1] ?? '';

    // hidden inputs에서 필수 파라미터 추출
    const ky = $('input[name="ky"]').val() as string || '';
    const CONTENT_SEQ = $('input[name="CONTENT_SEQ"]').val() as string
      || $('input[name="RS_SEQ"]').val() as string
      || FILE_GROUP_ID;
    const ud = $('input[name="ud"]').val() as string || '';

    // 3. 첨부파일 목록 조회
    const fileListHtml = await this.client.postHtml(
      `${BASE_URL}/ilos/co/efile_list.acl`,
      {
        ud,
        ky,
        CONTENT_SEQ: FILE_GROUP_ID || CONTENT_SEQ,
      },
    );
    const $fileList = cheerio.load(fileListHtml);

    // 파일 목록에서 첫 번째 파일 정보 추출
    let FILE_SEQ = '';
    let fileName = '';

    // JSON 응답이거나 HTML 목록일 수 있음
    const fileRows = $fileList('tr, .file-item, li');
    if (fileRows.length > 0) {
      const firstFile = fileRows.first();
      FILE_SEQ = firstFile.find('input[name="FILE_SEQ"]').val() as string
        || firstFile.find('[data-seq]').attr('data-seq')
        || '';
      fileName = firstFile.find('.file-name, .fname, a').first().text().trim();

      // onclick에서 FILE_SEQ 추출 시도
      if (!FILE_SEQ) {
        const dlAttr = firstFile.find('[onclick*="download"]').attr('onclick');
        const seqMatch = dlAttr?.match(/FILE_SEQ['":\s]*=?['"]?(\d+)/);
        FILE_SEQ = seqMatch?.[1] ?? '';
      }
    }

    // JSON 응답인 경우 파싱 시도
    if (!FILE_SEQ && !fileName) {
      try {
        const jsonData = JSON.parse(fileListHtml);
        if (Array.isArray(jsonData) && jsonData.length > 0) {
          FILE_SEQ = jsonData[0].FILE_SEQ || '';
          fileName = jsonData[0].FILE_NAME || '';
        }
      } catch {
        // JSON 파싱 실패 — 다른 방식으로 시도
      }
    }

    if (!FILE_SEQ) {
      throw new Error(`다운로드할 파일을 찾을 수 없습니다. ARTL_NUM: ${artlNum}`);
    }

    // 4. 파일 다운로드
    const downloadUrl = `${BASE_URL}/ilos/co/efile_download.acl?FILE_SEQ=${FILE_SEQ}&CONTENT_SEQ=${FILE_GROUP_ID || CONTENT_SEQ}&ky=${ky}&ud=${ud}&pf_st_flag=2`;

    const savePath = outputPath
      ? resolve(outputPath)
      : resolve(process.cwd(), fileName || `file_${FILE_SEQ}`);

    await this.client.downloadFile(downloadUrl, savePath);

    return savePath;
  }
}
