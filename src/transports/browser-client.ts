import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve, basename } from 'path';
import type { EclassConfig } from '../config/config.js';

const BASE_URL = 'https://eclass.tukorea.ac.kr';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

export class BrowserClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /** headless Chromium 실행, BrowserContext + Page 생성 */
  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });
    this.page = await this.context.newPage();
  }

  /** 포털 SSO → e-Class SSO 흐름 */
  async login(config: EclassConfig): Promise<void> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');

    const page = this.page;

    // 1. 포털 SSO 로그인 페이지 이동
    await page.goto('https://ksc.tukorea.ac.kr/sso/login_stand.jsp', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // 2. ID/PW 입력
    await page.fill('#internalId', config.id);
    await page.fill('#internalPw', config.pw);

    // 3. 로그인 버튼 클릭
    await page.click('#internalLogin');

    // 4. 포털 메인 도달 대기
    await page.waitForURL('**/portal/default/stu**', { timeout: 15000 });

    // 5. e-Class SSO 이동
    await page.goto('http://eclass.tukorea.ac.kr/ilos/sso/index.jsp', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // 6. e-Class 메인 도달 대기
    await page.waitForURL('**/ilos/main/main_form.acl', { timeout: 15000 });
  }

  /** GET 요청 후 page.content() 반환 */
  async getHtml(url: string): Promise<string> {
    if (!this.page) throw new Error('Browser not launched.');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return this.page.content();
  }

  /** POST 요청 후 page.content() 반환 (same-origin fetch) */
  async postHtml(url: string, data: Record<string, string>): Promise<string> {
    if (!this.page) throw new Error('Browser not launched.');

    // page.evaluate로 fetch 직접 호출 → 자동 쿠키 포함
    const html = await this.page.evaluate(
      async ({ targetUrl, body }) => {
        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body).toString(),
          redirect: 'follow',
        });
        return await resp.text();
      },
      { targetUrl: url, body: data },
    );

    return html;
  }

  /** multipart 파일 업로드 (과제 제출용) */
  async uploadFiles(
    url: string,
    filePaths: string[],
    params: Record<string, string>,
  ): Promise<string> {
    if (!this.page) throw new Error('Browser not launched.');

    // Node-side: 파일을 읽어서 Uint8Array + 이름 준비
    const filesData = filePaths.map((p) => ({
      name: basename(p),
      content: Array.from(readFileSync(p)) as number[],
    }));

    const responseText = await this.page.evaluate(
      async ({ targetUrl, files, formParams }) => {
        const formData = new FormData();
        for (const [key, value] of Object.entries(formParams)) {
          formData.append(key, value);
        }
        for (const file of files) {
          const blob = new Blob([new Uint8Array(file.content)], { type: 'application/octet-stream' });
          formData.append('file', blob, file.name);
        }
        const resp = await fetch(targetUrl, {
          method: 'POST',
          body: formData,
          redirect: 'follow',
        });
        return await resp.text();
      },
      { targetUrl: url, files: filesData, formParams: params },
    );

    return responseText;
  }

  /** 쿠키 기반 파일 다운로드 */
  async downloadFile(url: string, savePath: string): Promise<void> {
    if (!this.context) throw new Error('Browser not launched.');

    const cookies = await this.context.cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const { default: fetch } = await import('node-fetch');
    const response = await fetch(url, {
      headers: {
        Cookie: cookieStr,
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    mkdirSync(dirname(resolve(savePath)), { recursive: true });
    writeFileSync(savePath, buffer);
  }

  /** Page 인스턴스 반환 */
  getPage(): Page {
    if (!this.page) throw new Error('Browser not launched.');
    return this.page;
  }

  /** 브라우저 종료 */
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
