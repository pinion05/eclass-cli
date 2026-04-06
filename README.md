# eclass-cli

CLI-first 한국공학대학교 e-Class client

## 설치

```bash
pnpm install -g eclass-cli
```

또는:
```bash
npx eclass-cli <command>
```

## 설정

설정파일 `~/.eclass-cli/config.json`:
```json
{
  "id": "학번",
  "pw": "비밀번호"
}
```

또는 환경변수:
```bash
export ECLASS_ID=학번
export ECLASS_PW=비밀번호
```

## 사용법

### 수강과목
```bash
eclass course ls              # 수강과목 목록
eclass course show 딥러닝     # 과목 상세 (교수정보)
eclass course show 딥러닝 --json
```

### 과제
```bash
eclass assignment ls                    # 전체 과제
eclass assignment ls --course 딥러닝     # 과목 필터
eclass assignment ls --json             # JSON 출력
eclass assignment submit <RT_SEQ> --file <경로>   # 과제 제출
```

### 강의자료
```bash
eclass material ls --course 딥러닝      # 강의자료 목록
eclass material download <ARTL_NUM>     # 다운로드
eclass material download <ARTL_NUM> -o ./저장경로
```

## 기술 스택
- TypeScript + pnpm
- Playwright (headless)
- Commander.js
- Cheerio (HTML 파싱)
- Zod (타입 검증)

## 라이선스
MIT
