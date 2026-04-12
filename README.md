# eclass-cli

한국공학대학교 e-Class(ilos)용 CLI.

브라우저 자동화(Playwright)로 로그인한 뒤 아래 작업을 터미널에서 수행한다.
- 수강과목 목록 / 과목 상세 조회
- 과제 목록 / 과제 상세 조회
- 과제 파일 제출 / 본문 이미지 임베딩 / 기존 제출 수정
- 강의자료 목록 조회 / 첨부파일 다운로드

## 현재 지원 범위

현재 코드 기준으로 안정적으로 맞춰진 대상은 한국공학대학교 e-Class(`eclass.tukorea.ac.kr`)다.

참고:
- 설정 파일과 로그인 transport에는 `university` / `ECLASS_UNIVERSITY`가 있지만
- 실제 `course` / `assignment` / `material` 서비스 URL은 현재 모두 `https://eclass.tukorea.ac.kr` 기준으로 구현되어 있다.

즉, 현 시점 README 기준으로는 사실상 한국공학대학교 전용 CLI로 보는 게 맞다.

## 주요 기능

- `course ls`
  - 수강과목 목록 조회
- `course show <name>`
  - 과목명 부분일치로 과목 상세 조회
  - 교수, 이메일, 시간, 학점, 개요, 평가방법, 주차별 계획 포함
- `assignment ls`
  - TODO 목록 + 강의실 report 목록을 합쳐 과제 조회
- `assignment show <seq>`
  - 과제 상세 조회
  - 제출방식, 게시일, 마감일, 배점, 지각제출, 점수공개, 본문, 본문 이미지, 첨부파일 URL 포함
- `assignment submit <seq>`
  - 파일 첨부 제출
  - TinyMCE 본문 이미지 임베딩
  - 이미 제출한 과제면 수정 모드로 자동 전환
- `material ls --course <name>`
  - 강의자료 목록 조회
- `material download <artlNum>`
  - 강의자료 첨부파일 다운로드

## 설치

전역 설치:

```bash
npm install -g eclass-cli
```

일회성 실행:

```bash
npx eclass-cli@latest <command>
```

로컬 개발:

```bash
pnpm install
pnpm build
node dist/src/cli.js <command>
```

## 설정

### 1) 설정 파일 사용

`~/.eclass-cli/config.json`

```json
{
  "id": "학번",
  "pw": "비밀번호",
  "university": "tukorea.ac.kr"
}
```

동작:
- 설정 파일이 없으면 첫 실행 시 자동으로 생성된다.
- 그 직후 `id`와 `pw`를 채우라는 에러를 내고 종료한다.

### 2) 환경변수 사용

```bash
export ECLASS_ID="학번"
export ECLASS_PW="비밀번호"
export ECLASS_UNIVERSITY="tukorea.ac.kr"
```

우선순위:
- `ECLASS_ID` + `ECLASS_PW`가 있으면 설정 파일보다 환경변수를 우선 사용한다.

## 사용 전 알아둘 점

- 현재 CLI는 명령 파싱 전에 설정 확인 → 브라우저 실행 → 로그인까지 먼저 시도한다.
- 그래서 `--help`, `--version`도 일반적인 CLI처럼 즉시 출력되지 않을 수 있다.
- 최초 실행 시에는 help 대신 설정 파일 생성 메시지가 먼저 나오는 것이 현재 정상 동작이다.

## 명령 요약

```bash
eclass course ls [--json]
eclass course show <name> [--json]

eclass assignment ls [--course <course>] [--json]
eclass assignment show <seq> [--json]
eclass assignment submit <seq> [-f, --file <paths...>] [-i, --image <paths...>]

eclass material ls -c, --course <course> [--json]
eclass material download <artlNum> [-o, --output <path>]
```

## 사용 예시

### 수강과목

```bash
eclass course ls
eclass course ls --json

eclass course show 딥러닝
eclass course show 딥러닝 --json
```

주의:
- `course show <name>`은 완전일치가 아니라 부분일치로 찾는다.

### 과제

```bash
eclass assignment ls
eclass assignment ls --course 딥러닝
eclass assignment ls --json

eclass assignment show 6444455
eclass assignment show 6444455 --json

eclass assignment submit 6444455 --file report.pdf
eclass assignment submit 6444455 --file a.pdf b.xlsx
eclass assignment submit 6444455 --file a.pdf --file b.xlsx
eclass assignment submit 6444455 --image screenshot.png
eclass assignment submit 6444455 --file report.pdf --image img1.png img2.png
```

주의:
- `assignment ls`의 `--course`도 부분일치다.
- `--file`, `--image`는 여러 개 받을 수 있다.
- 현재 자유 본문 입력 옵션은 없다.
- 제출 시 본문은 내부적으로 `config.id` 값으로 채워진다.
- 이미 제출한 온라인 과제는 새 제출이 아니라 수정(update) 경로로 처리될 수 있다.

권장 흐름:

```bash
# 1. seq 찾기
eclass assignment ls --json

# 2. 상세 확인
eclass assignment show <seq> --json

# 3. 제출 또는 수정
eclass assignment submit <seq> --file report.pdf
```

### 강의자료

```bash
eclass material ls --course 딥러닝
eclass material ls --course 딥러닝 --json

eclass material download 1234567
eclass material download 1234567 -o ./downloads/
eclass material download 1234567 -o ./downloads/week1.pdf
```

주의:
- `material ls`는 `--course`가 필수다.
- 과목명은 부분일치로 찾는다.
- 표 출력에는 `artlNum`이 보이지 않는다.
- 다운로드할 때 필요한 `artlNum`은 `material ls --json` 결과에서 확인하는 것이 가장 정확하다.
- 현재 `material download`는 첨부파일이 여러 개여도 첫 번째 파일 1개만 다운로드한다.

`-o, --output` 규칙:
- 기존 디렉터리를 주면 그 안에 원래 파일명으로 저장
- `/` 또는 `\` 로 끝나는 경로도 디렉터리로 간주
- 그 외 경로는 파일 경로로 간주

예:

```bash
# 디렉터리로 저장
eclass material download 1234567 -o ./downloads/

# 파일명까지 직접 지정
eclass material download 1234567 -o ./downloads/week1.pdf
```

권장 흐름:

```bash
# 1. artlNum 확인
eclass material ls --course 딥러닝 --json

# 2. 다운로드
eclass material download <artlNum> -o ./downloads/
```

## JSON 출력 필드

### Course

```json
{
  "name": "딥러닝",
  "professor": "홍길동",
  "time": "화 1~3교시",
  "kjkey": "A20261CAI3200701"
}
```

### Assignment

```json
{
  "title": "5주차 수업과제",
  "course": "비즈니스영어",
  "category": "report",
  "dDay": "D-0",
  "deadline": "2026.04.10 오후 11:59",
  "status": "진행중",
  "kjkey": "A20261CAI3100101",
  "seq": "6444455"
}
```

### Material

```json
{
  "title": "1주차 강의자료",
  "author": "홍길동",
  "views": 12,
  "publishDate": "2026.03.05",
  "hasAttachment": true,
  "isRead": true,
  "artlNum": "1234567"
}
```

## 검증된 개발 명령

```bash
pnpm test
pnpm typecheck
pnpm build
```

현재 테스트는 `assignment-service` helper 중심이다.

## 제한사항

- 현재 README 기준으로는 한국공학대학교 환경에 맞춰져 있다.
- `university` 설정은 존재하지만 전체 서비스 레이어가 다대학 호환으로 완성된 상태는 아니다.
- `assignment submit`은 자유 텍스트 본문 입력 CLI 옵션이 없다.
- `material download`는 첫 번째 첨부파일만 받는다.
- 인증/사이트 구조가 바뀌면 Playwright 셀렉터 수정이 필요할 수 있다.
- 타 대학 direct login은 reCAPTCHA 등으로 실패할 수 있다.

## 기술 스택

- TypeScript
- Playwright
- Commander.js
- Cheerio
- Zod

## 라이선스

MIT
