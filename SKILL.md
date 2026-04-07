---
name: eclass-cli
description: 한국공학대학교 e-Class를 CLI로 과제확인/제출, 강의자료, 교수정보, 수강과목을 관리하는 도구를 사용할 때 참고하는 사용 스킬
---

# eclass-cli Skill

## 목적
`eclass-cli`를 이용해 한국공학대학교 e-Class에서 다음 작업을 수행한다.
- 수강과목 목록 조회 / 과목 상세(교수정보) 조회
- 과제 목록 조회 (필터링, JSON 출력)
- 과제 제출 (파일 첨부, 이미지 임베딩)
- 강의자료 목록 조회 / 다운로드

## 실행 원칙
- 로컬 클론에서 직접 실행하는 것을 우선한다 (npm 배포본이 최신 상태보다 뒤처질 수 있으므로).
- 로컬 클론: `~/work/eclass-cli`
- 빌드 후 실행: `cd ~/work/eclass-cli && pnpm build && node dist/src/cli.js <command>`
- 설정파일: `~/.eclass-cli/config.json` (id, pw) 또는 환경변수 `ECLASS_ID`, `ECLASS_PW`
- 모든 목록 명령에 `--json` 플래그 지원

## 설정

### 설정파일 (`~/.eclass-cli/config.json`)
```json
{
  "id": "학번",
  "pw": "비밀번호"
}
```
빈값 기본이며, 사용자가 직접 채우는 방식. 환경변수로 오버라이드 가능.

## 기본 명령

### 수강과목
```bash
node dist/src/cli.js course ls              # 수강과목 목록
node dist/src/cli.js course show 딥러닝     # 과목 상세 (교수정보 포함)
node dist/src/cli.js course show 딥러닝 --json
```

### 과제
```bash
node dist/src/cli.js assignment ls                    # 전체 과제
node dist/src/cli.js assignment ls --course 딥러닝     # 과목 필터
node dist/src/cli.js assignment ls --json             # JSON 출력
node dist/src/cli.js assignment submit <RT_SEQ> --file <경로>   # 파일 제출
node dist/src/cli.js assignment submit <RT_SEQ> --file <경로> --image <이미지>  # 파일+이미지
```

### 강의자료
```bash
node dist/src/cli.js material ls --course 딥러닝      # 강의자료 목록
node dist/src/cli.js material ls --course 딥러닝 --json
node dist/src/cli.js material download <ARTL_NUM>     # 다운로드
node dist/src/cli.js material download <ARTL_NUM> -o ./저장경로
```

## `--file` vs `--image` 차이
- `--file`: 첨부파일 (Plupload multipart POST) — **다중 지원** (`--file a.pdf --file b.docx`)
- `--image`: 본문 에디터에 인라인 이미지 임베딩 (클릭 인터랙션 방식) — **다중 지원** (`--image img1.png --image img2.png`)
- 둘 다 같이 쓰면 순차 실행: 파일 업로드 → 이미지 임베딩 → 제출
  - TinyMCE 툴바 → 이미지 버튼 → 찾아보기 → `file_upload_pop_form.acl?type=image`
  - 서버 업로드 후 URL이 본문에 `<img>` 태그로 삽입됨

## 과제 제출 시 주의
- 본문(textarea)이 비어있으면 제출 불가 → 기본값으로 학번(ID) 자동 입력
- 제출 후 제출된 파일 목록 + 제출 시각 재확인 출력

## 기술 스택
- TypeScript + pnpm
- Playwright (headless)
- Commander.js
- Cheerio (HTML 파싱)
- Zod (타입 검증)

## 프로젝트 구조
```
~/work/eclass-cli/
├── src/
│   ├── cli.ts                          # 진입점 (commander)
│   ├── commands/                       # CLI 커맨드 (course, assignment, material)
│   ├── config/config.ts                # 설정 로더 (~/.eclass-cli/config.json + env)
│   ├── domain/models.ts                # Zod 스키마 (Course, Assignment, Material, CourseDetail, SubmissionResult)
│   ├── domain/services/                # 비즈니스 로직
│   │   ├── course-service.ts           # listCourses(), getCourseDetail()
│   │   ├── assignment-service.ts       # listAssignments(), submit(), embedImageInEditor()
│   │   └── material-service.ts         # listMaterials(), download()
│   ├── output/formatters.ts            # console.table + JSON 출력
│   ├── runtime/create-app-context.ts   # DI 조립
│   └── transports/browser-client.ts    # Playwright (login, getHtml, postHtml, uploadFiles, downloadFile, enterCourseRoom)
├── docs/plan.md                        # 구현 계획
├── package.json, tsconfig.json
└── README.md
```

## 강의자료 상세 조회 (material show)
`material ls`로 목록은 볼 수 있지만, `material show` 명령은 없음. 상세 조회(본문+첨부파일)가 필요할 때는 Playwright로 직접 접근:

```js
// 반드시 강의실 진입 선행
await page.evaluate(() => eclassRoom(KJKEY));
await page.waitForLoadState('networkidle');

// 강의자료 상세 페이지 URL
const materialUrl = `https://eclass.tukorea.ac.kr/ilos/st/course/lecture_material_view_form.acl?ARTL_NUM=${ARTL_NUM}`;
await page.goto(materialUrl, { waitUntil: 'networkidle' });
```

**URL 패턴:** `/ilos/st/course/lecture_material_view_form.acl?ARTL_NUM=xxx`
- `/ilos/bbs/view_form.acl`은 404 반환 (과제 상세는 report_view_form.acl과 다름)
- 반드시 `eclassRoom()`으로 강의실 진입 후 접근해야 함

**첨부파일 추출 셀렉터:** `a[href*="efile_download"]` 또는 텍스트 매칭
**다운로드 URL 패턴:** `/ilos/co/efile_download.acl?FILE_SEQ=xxx&CONTENT_SEQ=xxx&ky=KJKEY&ud=xxx&pf_st_flag=2`
- 로그인 세션이 필요하므로 Playwright 컨텍스트 내에서 다운로드

## e-Class 이미지 비전 분석
과제 본문에 포함된 이미지(`img.imaxsoftUfiles`)를 분석할 때:
1. Playwright 로그인 세션으로 이미지 다운로드 (인증 필요)
2. `hermes chat -Q --image`는 미지원 — 대신 OpenRouter API 직접 호출
3. `execute_code` 샌드박스는 환경변수가 없으므로 반드시 `terminal`에서 Python 스크립트 실행
4. base64 이미지가 크면 curl arg too long → `urllib.request` 사용

```python
# terminal에서 실행 (execute_code 아님)
python3 -c "
import json, os, base64, urllib.request
with open('image.png','rb') as f: b64 = base64.b64encode(f.read()).decode()
payload = {
    'model': 'qwen/qwen3.5-flash-02-23',
    'messages': [{'role':'user','content':[
        {'type':'image_url','image_url':{'url':f'data:image/png;base64,{b64}'}},
        {'type':'text','text':'분석 요청'}
    ]}]
}
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',
    data=json.dumps(payload).encode(), headers={
        'Content-Type':'application/json',
        'Authorization':f'Bearer {os.environ[\"OPENROUTER_API_KEY\"]}'
    })
with urllib.request.urlopen(req, timeout=60) as resp:
    print(json.loads(resp.read())['choices'][0]['message']['content'])
"
```

## e-Class API/셀렉터 참고

### 로그인 흐름
1. `POST ksc.tukorea.ac.kr/sso/login_stand.jsp` → `#internalId`, `#internalPw`, `#internalLogin`
2. `/portal/default/stu` 도달 대기
3. `GET eclass.tukorea.ac.kr/ilos/sso/index.jsp` → e-Class SSO
4. `/ilos/main/main_form.acl` 도달 대기

### 강의실 진입
- **반드시** `eclassRoom(KJKEY)` JS 함수 호출 방식 사용
- 직접 URL 접근(`submain_form.acl?KJKEY=...`)은 리다이렉트됨
- `enterCourseRoom()` 메서드: 수강과목 목록 페이지에서 `window.eclassRoom(key)` 실행

### 강의자료 상세 페이지
- URL 패턴: `/ilos/st/course/lecture_material_view_form.acl?ARTL_NUM=...` (일반 게시판 `bbs/view_form.acl`과 다름)
- 반드시 `enterCourseRoom()` 후 접근해야 함
- 첨부파일: `#tbody_file a` 또는 `a[href*="efile_download"]`에서 추출

### 파일 다운로드 (Playwright)
- `page.goto()`로 다운로드 URL 직접 접근 시 "Download is starting" 에러 발생
- 해결: `context.newContext({ acceptDownloads: true })` 후 `Promise.all` 패턴 사용:
  ```js
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(url => { location.href = url; }, downloadUrl)
  ]);
  await download.saveAs(savePath);
  ```

### 주요 셀렉터 (cheerio 파싱)
| 대상 | 셀렉터 | 비고 |
|------|--------|------|
| 수강과목 컨테이너 | `.content-container` | `.content-title` 단독 사용 불가 — sibling traversal 실패 |
| 과목명 | `.content-title` | 컨테이너 내부에서 |
| 교수명 | `.content-author > li:nth-child(1) > span` | |
| 시간/장소 | `.content-author > li:nth-child(2) > span` | |
| KJKEY | `a[onclick*="eclassRoom"]`에서 정규추출 | `eclassRoom('KJKEY')` |
| 과제 항목 | `.todo_wrap` | `.todo`가 아님 |
| 과제 hidden inputs | `input[id^="gubun_"]`, `input[id^="kj_"]` | name이 아닌 id 기반 |
| 과제 goLecture | `goLecture('KJKEY','SEQ','CATEGORY')` | 위치적 파라미터 |
| 강의자료 제목 | `.subjt_top` | |
| 강의자료 작성자/조회수 | `.subjt_bottom` | "이름  조회 N" 분리 필요 |
| 강의계획서 | `plan_form.acl?lecture_id=KJKEY` | 새 탭이 열릴 수 있으나 직접 URL 접근 가능 |

### AJAX 동적 콘텐츠
- 강의자료 목록 등 AJAX로 로드되는 페이지는 `waitUntil: 'networkidle'` 필요
- `domcontentloaded`만 대기하면 빈 목록 반환

## 이미지 임베딩 상세 흐름 (embedImageInEditor)
`--image`는 단순 파일 첨부가 아닌 TinyMCE 에디터 클릭 인터랙션:
1. `#JR_TXT_image` 버튼 클릭 → TinyMCE 인라인 팝업 (`image.htm` iframe)
2. iframe 내 "찾아보기" 버튼 클릭 → `myFileBrowser()` → 새 팝업
3. `file_upload_pop_form.acl?type=image` 팝업에서 `input[type="file"]`에 파일 설정
4. 업로드 버튼 클릭 → 서버에 업로드 → `/ilosfiles/editor-file/{KJKEY}/{연도}/{랜덤ID}.png` 경로에 저장
5. 업로드된 파일 링크 클릭 → URL이 image.htm의 `#src` 필드에 채워짐
6. `#insert` 버튼 클릭 → `<img class="imaxsoftUfiles" src="...">`가 에디터 본문에 삽입

## Git 상태
- 브랜치: `feat/eclass-cli` (작업 브랜치)
- `master`에는 `init: project scaffolding`만 있음
- Remote: https://github.com/pinion05/eclass-cli (feat/eclass-cli push됨)
- PR: https://github.com/pinion05/eclass-cli/pull/1 (feat/eclass-cli → master)
- 봇 리뷰 후 --no-ff merge 예정
- 커밋: 11개 (70cae72 ~ f973394)
- 최신 커밋: `f973394` docs: README 다중 대학 ilos 호환 포지셔닝

## 검증 현황 (Smoke Test)
| 명령 | 상태 | 비고 |
|------|------|------|
| `course ls` | ✅ | 5개 수강과목 정상 |
| `course show 딥러닝` | ✅ | 교수정보+주차별계획 (enterCourseRoom 수정 후 통과) |
| `assignment ls` | ✅ | 10개 과제 (.todo_wrap 셀렉터 수정 후 통과) |
| `assignment ls --json` | ✅ | JSON 출력 정상 |
| `material ls --course 딥러닝` | ✅ | 5개 강의자료 (networkidle 수정 후 통과) |
| `material ls --course 딥러닝 --json` | ✅ | JSON 출력 정상 |
| `assignment submit --file` | ⚠️ 미테스트 | 실제 제출 부수효과 |
| `assignment submit --image` | ⚠️ 미테스트 | embedImageInEditor iframe 셀렉터 미검증 |
| `--file` 다중 지원 | ✅ | `--file a.pdf --file b.docx` 형태 |

## `assignment show <seq>` — 과제 상세 조회
- **상태:** ✅ 구현됨 (feat/assignment-show 브랜치)
- **명령:** `node dist/src/cli.js assignment show <seq> [--json]`
- **파싱 항목:** 제목, 제출방식, 게시일, 마감일, 배점, 지각제출, 점수공개, 본문(HTML+이미지), 첨부파일
- **주의:** 강의실 진입(`enterCourseRoom`)이 선행되어야 report_view_form.acl 접근 가능. 직접 URL 접근 시 "해당 과목에 접근 권한이 없습니다" 반환
- **Zod 스키마:** `AssignmentDetailSchema` (models.ts)
- **서비스 메서드:** `getAssignmentDetail(seq)` — 목록에서 kjkey 찾기 → 강의실 진입 → 상세 파싱

### 과제 상세 페이지 셀렉터 (report_view_form.acl)
| 항목 | 셀렉터 | 비고 |
|------|--------|------|
| 메타 테이블 | `table.bbsview` | caption "과제물 내용 상세보기" |
| 각 행 | `tbody > tr` | th scope="row" + td 구조 |
| 제목 | th="제목" → `td.first` | `.clone().children().remove().end().text()` 로 중요글 div 제외 |
| 제출방식 | th="제출방식" → `td` | "온라인" 등 |
| 게시일 | th="게시일" → `td` | "2026.04.04 오후 4:00" 형식 |
| 마감일 | th="마감일" → `td` | 동일 날짜 형식 |
| 배점 | th="배점" → `td` | 숫자 또는 "비공개" |
| 지각제출 | th="지각제출" → `td` | "불허" / "허용" |
| 점수공개 | th="점수공개" → `td > div:first` | "공개" / "미공개" |
| 공개시작일 | th="점수공개" → td 내 "시작일 : ..." | 정규 `/시작일\s*:\s*([\d.]+\s*(?:오전|오후)\s*\d+:\d+)/` |
| 공개마감일 | th="점수공개" → td 내 "마감일 : ..." | "무제한" 또는 날짜 |
| 본문 | `td.textviewer > div:first` | HTML (에디터 원본), `.html()`로 추출 |
| 본문 이미지 | `td.textviewer img.imaxsoftUfiles` | src는 상대경로 → BASE_URL prefix 필요 |
| 첨부파일 | `#tbody_file a` | href + text |
| hidden inputs | `input#KJ_YEAR`, `input#KJ_TERM`, `input#KJ_KEY` | 강의실 컨텍스트 정보 |

### 과제 상세 HTML 덤프 팁
- 덤프 스크립트는 반드시 `enterCourseRoom(kjkey)` 후 `getHtml(report_view_form.acl)` 호출
- `/tmp/`에 임시 스크립트 작성 시 playwright import는 프로젝트 node_modules에서: `require('/home/pinion/work/eclass-cli/node_modules/playwright')`

## 인증 필요한 리소스 다운로드 (이미지 등)
e-Class의 파일/이미지 URL은 로그인 세션이 필요함. `BrowserClient.downloadFile()`이나 `page.goto(imageUrl)`로 직접 다운 가능.
- 본문 이미지: `/ilosfiles/editor-file/{KJKEY}/{연도}/{ID}.png` — 강의실 진입 세션 필요
- 독립 스크립트로 다운로드할 땐 `require('playwright')`를 프로젝트 경로에서 불러와야 함:
  ```js
  const { chromium } = require('/home/pinion/work/eclass-cli/node_modules/playwright');
  // login → enterCourseRoom → page.goto(imageUrl) → resp.body() → writeFileSync
  ```

## 과제 상세 HTML 파싱 상세 (table.bbsview)

### findRow 헬퍼
```ts
const findRow = (thText: string) => rows.filter((_, el) => $(el).find('th').text().trim() === thText);
```

### 제목 추출 시 주의
`td.first`에 `.impt` div(중요글 표시)가 포함되어 있으므로 `.clone().children().remove().end().text().trim()`으로 제거 후 추출.

### 점수공개 파싱
- "미공개": 첫 div 텍스트만
- "공개": 첫 div = "공개", 이후 div에 시작일/마감일 포함. 정규로 추출.

### 본문 content
- `td.textviewer > div:first`의 `.html()`이 에디터 원본 HTML
- 이미지 src는 상대경로이므로 `${BASE_URL}${src}` 변환 필요
- 첨부파일은 `#tbody_file a`에서 추출 (빈 경우 많음)

## Playwright 직접 스크립트 작성 시 병목 해결 패턴

### 1. 강의실 페이지 직접 URL 접근 → 404
- `report_view_form.acl?RT_SEQ=...` 등 강의실 컨텍스트가 필요한 페이지는 직접 URL 접근 시 404
- 반드시 `enterCourseRoom(KJKEY)` 또는 `goLecture(KJKEY, SEQ, CATEGORY)`로 접근
- 잘못된 URL: `bbs/view_form.acl?ARTL_NUM=...`
- 올바른 URL: `st/course/lecture_material_view_form.acl?ARTL_NUM=...` (강의자료)

### 2. goLecture() 리다이렉트 체인 → waitForURL 타임아웃
- `goLecture()` → `todo_list_connect.acl` → `report_view_form.acl` 다단계 리다이렉트
- `waitForURL('**/report_view_form**')`은 중간 URL에서 타임아웃 발생 가능
- **해결:** DOM 요소 기준 대기 사용
```js
await Promise.all([
  page.waitForFunction(() => document.querySelector('#submit_div') !== null),
  page.evaluate(() => goLecture(KJKEY, SEQ, 'report'))
]);
await page.waitForLoadState('networkidle');
```

### 3. PDF 다운로드 → "Download is starting" 에러
- `page.goto(다운로드URL)` 시 브라우저가 다운로드를 시작하면 navigation이 완료되지 않음
- **해결:** `acceptDownloads: true` 컨텍스트 + `waitForEvent('download')`
```js
const context = await browser.newContext({ acceptDownloads: true });
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.evaluate(url => { location.href = url; }, downloadUrl)
]);
await download.saveAs('/tmp/file.pdf');
```

### 4. TinyMCE 에디터 제출 (온라인 과제)
- iframe 셀렉터: `#JR_TXT_ifr` (채팅 iframe `class_chat_view_iframe`과 구분 필수)
- 본문 입력:
```js
const mceFrame = page.frameLocator('#JR_TXT_ifr');
await mceFrame.locator('body').click();
await mceFrame.locator('body').fill(content);
```
- 저장 버튼: `#saveBtn` (`div#saveBtn.site_button`)
- 제출 후 `waitForNavigation` 타임아웃 가능 (AJAX 제출) → `waitForTimeout(3000)`으로 대체
- 제출 성공 확인: `#saveBtn` 사라짐 + "제출일" 텍스트 출현

### 5. 강의자료 첨부파일 URL
- `material ls`에서 `hasAttachment: true`인 항목만 첨부파일 있음
- 첨부파일 다운로드 URL 패턴: `/ilos/co/efile_download.acl?FILE_SEQ=...&CONTENT_SEQ=...&ky=KJKEY&ud=...&pf_st_flag=2`
- URL은 과제 상세 페이지에서 `#tbody_file a[href*=download]`로 추출 가능

## 검증/안전 원칙
- `assignment submit`은 실제 제출이므로 부수효과가 큼. 테스트 시 주의.
- `material download`는 실제 파일이 저장됨.
- 조회 명령(ls, show)은 안전하게 실행 가능.
- `embedImageInEditor`는 iframe/팝업 셀렉터가 실제 UI와 미세하게 다를 수 있어, 실제 제출 테스트로 검증 필요.

- 관련 파일
- 스펙: `~/.eclass-cli/clarified-spec.md` (Deep Interview 결과)
- 설정: `~/.eclass-cli/config.json`
- 리포지토리: `~/work/eclass-cli` (https://github.com/pinion05/eclass-cli)

## ilos LMS 호환 대학
(주)지누스(iNUS) ilosis 제품. URL 패턴 `eclass.{도메인}.ac.kr/ilos/...`이면 같은 시스템.
- 한국공학대학교 (eclass.tukorea.ac.kr)
- 한국산업기술대학교 (eclass.kpu.ac.kr)
- 서울과학기술대학교 (eclass.seoultech.ac.kr)
- 한국외국어대학교 (eclass.hufs.ac.kr)
- 한세대학교 (eclass.hansei.ac.kr)
- 서울예술대학교 (eclass.seoularts.ac.kr)
- 동덕여자대학교 (eclass.dongduk.ac.kr)
- 서강대학교 (eclass.sogang.ac.kr)
- 구미대학교 (eclass.gumi.ac.kr)
- 각 대학 자체 호스팅(on-premise). SSO 방식은 대학마다 다를 수 있어 호환 시 로그인 흐름 분기 필요.
