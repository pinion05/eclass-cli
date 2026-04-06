# eclass-cli Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 한국공학대학교 e-Class를 headless Playwright 기반 CLI로 자동화하여 과제 확인/제출, 강의자료, 교수정보, 수강과목을 터미널에서 관리

**Architecture:** bunjang-cli와 동일한 계층 구조(Commander CLI → Commands → Services → BrowserClient)를 따르되, API 트랜스포트 없이 Playwright 단일 트랜스포트만 사용. HTML 파싱은 cheerio를 사용. 인증은 포털 SSO → e-Class SSO 흐름.

**Tech Stack:** TypeScript, pnpm, Playwright, commander, zod, cheerio, console.table

---

## Task 1: 프로젝트 스캐폴딩

**Objective:** bunjang-cli와 동일한 구조로 빈 프로젝트 생성

**Files:**
- Create: `~/work/eclass-cli/package.json`
- Create: `~/work/eclass-cli/tsconfig.json`
- Create: `~/work/eclass-cli/src/cli.ts`
- Create: `~/work/eclass-cli/.gitignore`

**Step 1: 프로젝트 디렉토리 생성 및 package.json 작성**

```json
{
  "name": "eclass-cli",
  "version": "0.1.0",
  "description": "CLI-first 한국공학대학교 e-Class client",
  "license": "MIT",
  "type": "module",
  "packageManager": "pnpm@10.32.1",
  "bin": {
    "eclass": "dist/src/cli.js"
  },
  "files": [
    "dist/src/",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsc && node dist/src/cli.js"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "playwright": "^1.51.0",
    "cheerio": "^1.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 2: tsconfig.json 작성** (bunjang-cli와 동일 구조)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**Step 3: .gitignore**

```
node_modules/
dist/
*.js.map
.DS_Store
```

**Step 4: 최소 cli.ts (빈 commander)**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program
  .name('eclass')
  .description('CLI-first 한국공학대학교 e-Class client')
  .version('0.1.0')
  .option('--json', 'JSON 출력');

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

**Step 5: pnpm install && pnpm build && git init**

```bash
cd ~/work/eclass-cli
pnpm install
pnpm build
git init && git add -A && git commit -m "init: project scaffolding"
```

**Verify:** `node dist/src/cli.js --help` 출력 확인

---

## Task 2: Config 모듈

**Objective:** ~/.eclass-cli/config.json + 환경변수에서 ID/PW 로드

**Files:**
- Create: `src/config/config.ts`

**코드:**

```typescript
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface EclassConfig {
  id: string;
  pw: string;
  configPath: string;
}

const CONFIG_DIR = join(homedir(), '.eclass-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getConfig(): EclassConfig {
  const envId = process.env.ECLASS_ID?.trim();
  const envPw = process.env.ECLASS_PW?.trim();

  if (envId && envPw) {
    return { id: envId, pw: envPw, configPath: 'env' };
  }

  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify({ id: '', pw: '' }, null, 2) + '\n');
    throw new Error(
      `설정파일이 생성되었습니다: ${CONFIG_FILE}\n` +
      `id와 pw를 입력해주세요.`
    );
  }

  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  const id = raw.id?.trim();
  const pw = raw.pw?.trim();

  if (!id || !pw) {
    throw new Error(
      `설정파일에 id와 pw를 입력해주세요: ${CONFIG_FILE}`
    );
  }

  return { id, pw, configPath: CONFIG_FILE };
}
```

**Verify:** `node -e "import('./dist/src/config/config.js').then(m => console.log(m.getConfig()))"`

---

## Task 3: Domain Models (Zod)

**Objective:** Zod 스키마로 핵심 도메인 타입 정의

**Files:**
- Create: `src/domain/models.ts`

**코드:**

```typescript
import { z } from 'zod';

// 수강과목
export const CourseSchema = z.object({
  name: z.string(),
  professor: z.string(),
  time: z.string(),
  kjkey: z.string(),
});
export type Course = z.infer<typeof CourseSchema>;

// 과제 (todo list)
export const AssignmentSchema = z.object({
  title: z.string(),
  course: z.string(),
  category: z.enum(['report', 'test', 'lecture_weeks', 'project']),
  dDay: z.string(),
  deadline: z.string(),
  status: z.enum(['진행중', '종료']),
  kjkey: z.string(),
  seq: z.string(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

// 강의자료
export const MaterialSchema = z.object({
  title: z.string(),
  author: z.string(),
  views: z.number(),
  publishDate: z.string(),
  hasAttachment: z.boolean(),
  isRead: z.boolean(),
  artlNum: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

// 교수/강의계획서
export const CourseDetailSchema = z.object({
  name: z.string(),
  professor: z.string(),
  email: z.string().nullable(),
  time: z.string(),
  credits: z.string(),
  overview: z.string().nullable(),
  grading: z.string().nullable(),
  weeklyPlan: z.array(z.object({
    week: z.string(),
    content: z.string(),
  })),
  kjkey: z.string(),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

// 과제 제출 결과
export const SubmissionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  submittedFiles: z.array(z.string()),
  submittedAt: z.string(),
});
export type SubmissionResult = z.infer<typeof SubmissionResultSchema>;
```

---

## Task 4: Playwright BrowserClient

**Objective:** headless Playwright로 포털 SSO → e-Class 로그인 및 페이지 네비게이션

**Files:**
- Create: `src/transports/browser-client.ts`

**핵심 설계:**
- `launch()`: headless Chromium 실행, 컨텍스트/페이지 생성
- `login(id, pw)`: 포털 SSO → e-Class SSO 로그인 흐름
- `navigate(url)`: URL 이동 + 응답 HTML 반환
- `postForm(url, data)`: POST 요청 + 응답 HTML 반환
- `uploadFile(url, filePath, multipartParams)`: 파일 업로드 (과제 제출용)
- `downloadFile(url, savePath)`: 파일 다운로드 (강의자료용)
- `close()`: 브라우저 종료

```typescript
import { chromium, type Page, type BrowserContext } from 'playwright';
import type { EclassConfig } from '../config/config.js';

export class BrowserClient {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(): Promise<void> {
    this.context = await chromium.launch({
      headless: true,
    }).then(b => b.newContext({ userAgent: 'Mozilla/5.0 ...' }));
    this.page = await this.context.newPage();
  }

  async login(config: EclassConfig): Promise<void> {
    const page = this.getPage();
    // 1. 포털 SSO 로그인
    await page.goto('https://ksc.tukorea.ac.kr/sso/login_stand.jsp');
    await page.fill('#internalId', config.id);
    await page.fill('#internalPw', config.pw);
    await page.click('#internalLogin');
    await page.waitForURL('**/portal/default/stu', { timeout: 15000 });
    // 2. e-Class SSO
    await page.goto('http://eclass.tukorea.ac.kr/ilos/sso/index.jsp');
    await page.waitForURL('**/main/main_form.acl', { timeout: 15000 });
  }

  async getHtml(url: string): Promise<string> { ... }
  async postHtml(url: string, data: Record<string, string>): Promise<string> { ... }
  async downloadFile(url: string, savePath: string): Promise<void> { ... }
  async uploadFiles(url: string, files: string[], params: Record<string, string>): Promise<void> { ... }
  async getPage(): Page { ... }
  async close(): Promise<void> { ... }
}
```

**주의:** 실제 구현에서는 cheerio 대신 Playwright의 `page.content()`로 HTML을 가져와서 파싱.

---

## Task 5: Output 포매터

**Objective:** 터미널 테이블 + JSON 출력 지원

**Files:**
- Create: `src/output/formatters.ts`

**코드:**

```typescript
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
```

---

## Task 6: Service — CourseService

**Objective:** 수강과목 목록 조회 + 과목 상세(교수정보) 조회

**Files:**
- Create: `src/domain/services/course-service.ts`

**핵심 로직:**
- `listCourses()`: `/ilos/mp/course_register_list_form.acl`에서 HTML 파싱
  - `content-title` → 강의명
  - `content-author > li[0] > span` → 교수명
  - `content-author > li[1] > span` → 시간/장소
  - `eclassRoom('...')` onclick → KJKEY 추출
- `getCourseDetail(courseName)`: 수강과목 중 이름 매칭 → 강의계획서 파싱
  - `plan_form.acl?lecture_id=KJKEY` 접속 (새 탭 열림 주의)
  - Table 1: 교수명, 이메일, 강의시간, 학점, 개요, 평가방법
  - Table 2: 주차별 계획

---

## Task 7: Service — AssignmentService

**Objective:** 과제 목록 조회 + 과제 제출

**Files:**
- Create: `src/domain/services/assignment-service.ts`

**핵심 로직:**
- `listAssignments(courseFilter?)`: POST `/ilos/mp/todo_list.acl` → HTML 파싱
  - `todo_title`, `todo_subjt`, `todo_d_day`, `todo_date`, `gubun`
  - 상태 파생: 마감일 vs 현재 시각 비교
  - courseFilter 있으면 `todo_subjt`로 필터링
- `submit(seq, options)`: 과제 제출
  1. `/ilos/st/course/report_view_form.acl?RT_SEQ={seq}` 이동
  2. hidden inputs (KJ_YEAR, KJ_TERM, KJ_KEY, RT_SEQ, CONTENT_SEQ) 추출
  3. 본문 textarea에 기본값(학번 ID) 입력 (null 방지)
  4. `--file` 있으면 multipart POST `/ilos/co/efile_upload_multiple2.acl`
    - params: `path=K006, ud=학번, ky=KJKEY, pf_st_flag=2`
  5. 저장 요청 (form submit)
  6. 제출 완료 후 페이지에서 제출된 파일 목록 + 시각 재확인

---

## Task 8: Service — MaterialService

**Objective:** 강의자료 목록 조회 + 다운로드

**Files:**
- Create: `src/domain/services/material-service.ts`

**핵심 로직:**
- `listMaterials(courseName)`: 과목 강의실 진입 → 강의자료 탭 → HTML 파싱
  1. `courseService.listCourses()`에서 KJKEY 찾기
  2. `eclassRoom2.acl` POST로 강의실 진입
  3. `/ilos/st/course/lecture_material_list_form.acl` 접속
  4. `subjt_top` → 제목, `subjt_bottom` → 작성자+조회수, 공개일 컬럼
  5. `unread_article` class → 읽음 여부
- `download(artlNum)`: 첨부파일 다운로드
  1. 상세 페이지에서 FILE_GROUP_ID 추출
  2. `/ilos/co/efile_list.acl` POST로 파일 목록 획득
  3. `/ilos/co/efile_download.acl` GET으로 다운로드

---

## Task 9: CLI Commands 등록

**Objective:** commander에 모든 서브커맨드 등록

**Files:**
- Create: `src/commands/course.ts`
- Create: `src/commands/assignment.ts`
- Create: `src/commands/material.ts`
- Modify: `src/cli.ts`

**커맨드 구조:**
```
eclass course ls [--json]
eclass course show <과목명> [--json]
eclass assignment ls [--course <과목명>] [--json]
eclass assignment submit <RT_SEQ> --file <경로> [--image <경로>]
eclass material ls --course <과목명> [--json]
eclass material download <ARTL_NUM> [--output <경로>]
```

**각 command 파일 패턴:**
```typescript
import { Command } from 'commander';

export function registerCourse(program: Command): void {
  const course = program.command('course').description('수강과목 관리');

  course
    .command('ls')
    .description('수강과목 목록')
    .option('--json', 'JSON 출력')
    .action(async (opts) => {
      // 서비스 호출 + 출력
    });

  course
    .command('show <name>')
    .description('과목 상세 (교수정보 포함)')
    .option('--json', 'JSON 출력')
    .action(async (name, opts) => {
      // 서비스 호출 + 출력
    });
}
```

**cli.ts 업데이트:**
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerCourse } from './commands/course.js';
import { registerAssignment } from './commands/assignment.js';
import { registerMaterial } from './commands/material.js';

const program = new Command();
program
  .name('eclass')
  .description('CLI-first 한국공학대학교 e-Class client')
  .version('0.1.0')
  .option('--json', 'JSON 출력');

registerCourse(program);
registerAssignment(program);
registerMaterial(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

---

## Task 10: AppContext (DI)

**Objective:** 모든 서비스를 한 곳에서 조립

**Files:**
- Create: `src/runtime/create-app-context.ts`

```typescript
import { getConfig } from '../config/config.js';
import { BrowserClient } from '../transports/browser-client.js';
import { CourseService } from '../domain/services/course-service.js';
import { AssignmentService } from '../domain/services/assignment-service.js';
import { MaterialService } from '../domain/services/material-service.js';

export async function createAppContext() {
  const config = getConfig();
  const browser = new BrowserClient();
  await browser.launch();
  await browser.login(config);

  const courseService = new CourseService(browser);
  const assignmentService = new AssignmentService(browser, config);
  const materialService = new MaterialService(browser, courseService);

  return { config, browser, courseService, assignmentService, materialService };
}
```

---

## Task 11: 통합 테스트 (Smoke Test)

**Objective:** 실제 e-Class에 로그인하여 모든 커맨드 동작 확인

**Verify 순서:**
1. `node dist/src/cli.js course ls` → 수강과목 5개 출력
2. `node dist/src/cli.js course show 딥러닝` → 교수정보 + 주차별 계획
3. `node dist/src/cli.js assignment ls` → 과제 목록
4. `node dist/src/cli.js assignment ls --course 딥러닝 --json` → JSON 필터링
5. `node dist/src/cli.js material ls --course 딥러닝` → 강의자료 목록
6. `node dist/src/cli.js material download <ARTL_NUM>` → 파일 다운로드

---

## Task 12: README + git init

**Objective:** README 작성 및 초기 커밋

**Files:**
- Create: `README.md`

---

## 디렉토리 구조 (최종)

```
eclass-cli/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── course.ts
│   │   ├── assignment.ts
│   │   └── material.ts
│   ├── config/
│   │   └── config.ts
│   ├── domain/
│   │   ├── models.ts
│   │   └── services/
│   │       ├── course-service.ts
│   │       ├── assignment-service.ts
│   │       └── material-service.ts
│   ├── output/
│   │   └── formatters.ts
│   ├── runtime/
│   │   └── create-app-context.ts
│   └── transports/
│       └── browser-client.ts
└── dist/
```

## 실행 순서 요약

| Task | 내용 | 의존 |
|------|------|------|
| 1 | 프로젝트 스캐폴딩 | 없음 |
| 2 | Config 모듈 | 없음 |
| 3 | Domain Models | 없음 |
| 4 | BrowserClient | Task 2 |
| 5 | Output 포매터 | Task 3 |
| 6 | CourseService | Task 3, 4 |
| 7 | AssignmentService | Task 3, 4 |
| 8 | MaterialService | Task 3, 4, 6 |
| 9 | CLI Commands | Task 5, 6, 7, 8 |
| 10 | AppContext | Task 4, 6, 7, 8 |
| 11 | 통합 테스트 | 전체 |
| 12 | README | 전체 |
