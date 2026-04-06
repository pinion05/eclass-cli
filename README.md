# eclass-cli

CLI-first ilos 기반 e-Class LMS client

ilos(지누스) LMS를 사용하는 한국 대학교의 e-Class를 터미널에서 관리.

## 지원 대학

ilos 기반 e-Class를 사용하는 대학에서 동작합니다.

| 대학 | e-Class URL |
|------|-------------|
| 한국공학대학교 | eclass.tukorea.ac.kr |
| 한국산업기술대학교 | eclass.kpu.ac.kr |
| 서울과학기술대학교 | eclass.seoultech.ac.kr |
| 한국외국어대학교 | eclass.hufs.ac.kr |
| 한세대학교 | eclass.hansei.ac.kr |
| 서울예술대학교 | eclass.seoularts.ac.kr |
| 동덕여자대학교 | eclass.dongduk.ac.kr |
| 서강대학교 | eclass.sogang.ac.kr |
| 구미대학교 | eclass.gumi.ac.kr |

> SSO 로그인 방식은 대학별로 다를 수 있습니다. 현재 한국공학대학교 포털 SSO가 기본 지원됩니다.

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
eclass assignment submit <RT_SEQ> --file report.pdf                # 과제 제출
eclass assignment submit <RT_SEQ> --file a.pdf --file b.xlsx      # 여러 파일
eclass assignment submit <RT_SEQ> --image screenshot.png          # 이미지 임베딩
eclass assignment submit <RT_SEQ> --file report.pdf --image img.png  # 파일 + 이미지
```

### 강의자료
```bash
eclass material ls --course 딥러단      # 강의자료 목록
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
