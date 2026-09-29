# CLAUDE.md — 솔루션아카이브 운영 OS (SOLUTION ARCHIVE Internal OS)

> 이 문서는 Claude Code가 이 프로젝트에서 일관되게 작업하기 위한 **프로젝트 헌법**이다.
> 모든 코드 작성·구조 결정·네이밍은 이 문서를 우선 기준으로 삼는다.
> 상태: **v0.1 (기획 확정 단계)** — `## 미확정/확인 필요` 섹션은 작업 전 사용자 확인 필수.

---

## 1. 프로젝트 개요 (Mission)

솔루션아카이브(SOLUTION ARCHIVE)는 여러 크리에이터와 함께 다수 브랜드·상품을 만들어 파는 회사다.
이 프로젝트는 흩어진 사내 운영 업무를 한곳에서 보고·분석·자동화하는 **내부 전용 웹 애플리케이션**이다.

**핵심 목표(이 앱의 진짜 KPI):** "데이터를 본다"가 아니라 **"운영 의사결정에 드는 시간을 줄인다."**
대시보드는 수단일 뿐, 최종 지향점은 *인사이트가 사람을 찾아오게 만드는 것*이다.

---

## 2. 기술 스택 (Tech Stack) — 확정

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | **Next.js (App Router) + TypeScript** | |
| 스타일 | **Tailwind CSS + shadcn/ui** | "간결·세련·고가독성" UI의 기본값 |
| 차트 | **Recharts** | shadcn 차트와 호환 |
| DB / 인증 / 권한 | **Supabase** (Postgres + Auth + RLS) | 현재는 이메일 허용목록 단일 권한. 역할 RBAC 는 §5-2(미구현) |
| 로그인 | **Google Workspace SSO** | |
| AI 인사이트/콘텐츠 | **Anthropic API (Claude)** | 데이터 해석·용어 풀이·SNS 초안 생성 |
| 배포 | **Vercel** | **공개(public)** GitHub 레포 → git push 자동 배포 (공개인 이유는 아래 주의) |
| 정기 작업 | **Vercel Cron / Supabase Edge Functions** | 매일 새벽 데이터 수집, 주간 자동 브리핑 |

**금지/주의:**
- 비밀키(API key, secret)는 절대 클라이언트 코드/레포에 하드코딩하지 않는다. 환경변수 + Supabase Vault.
- 외부 데이터 수집은 **실시간 금지**. 기본 **매일 새벽 1회 배치**. (실시간이 꼭 필요한 모듈만 예외 명시)
- ⚠️ **이 리포는 공개다. 커밋하는 것은 전부 익명으로 읽힌다.**
  2026-09-17 까지 이 표는 "비공개"라고 적고 있었지만 실물은 처음부터 공개였다
  (익명 `curl` 로 `CLAUDE.md` 가 HTTP 200 으로 읽히는 것을 확인했다).
  **의도된 선택이다** — 공개 리포라야 GitHub Actions 분이 무제한 무료이고,
  이 리포는 매일 도는 워크플로가 13개다(남헌 2026-09-17 결정).
  - 그래서 `drafts/` 의 미발행 초안, `docs/` 의 설계, `methodology/`, `reports/` 가
    전부 외부에 읽힌다. **읽혀도 되는 것만 커밋한다.**
  - 시크릿은 GitHub Secrets 와 `.env.local` 에만 둔다. `.env` 류를 커밋하지 않는다
    (2026-09-17 실측: 커밋 이력 전체에 `.env` 0건, JWT 하드코딩 0건).
  - **방향이 잡히고 실배포 단계에 가면 비공개로 전환한다.** 그때 Actions 가
    월 2,000분 한도로 바뀌므로, 전환 전에 워크플로 13개의 실제 사용량을 먼저 계산한다.

### 2.1 예외 — `ai-office/` 는 다른 스택을 쓰는 하위 프로젝트다

**`ai-office/` 는 위 표의 Next.js / Supabase / Vercel 스택을 쓰지 않는다.**
AI 직원이 돌아다니는 픽셀 오피스 시각화로, 이 리포 안에 있지만 **배포 대상도
런타임도 완전히 별개**다.

| 항목 | 본체(SolutionArchive) | `ai-office/` |
|---|---|---|
| 프레임워크 | Next.js (App Router) | **vinext** (Vite 기반 Next 호환 레이어) |
| 런타임·배포 | Vercel (`solutionarch`) | **Cloudflare Workers + Wrangler** |
| 데이터 | Supabase | **없음** — `company.config.ts` 의 정적 설정으로 도는 시뮬레이션 |
| 비밀값 | `.env.local` / Vercel env | `.dev.vars` / `wrangler secret put` |
| 배포 명령 | `vercel --prod` | `cd ai-office && npx vinext deploy` |

지켜야 할 것:

- **별도 레포로 분리하지 않는다.** 이 리포 안에 그대로 둔다. 대신 본체의 스택
  규칙(§2)·폴더 구조(§6)를 `ai-office/` 에 적용하지 않는다. 그 폴더의 작업
  지침은 `ai-office/CLAUDE.md` 가 정본이다.
- **본체 빌드·배포와 섞지 않는다.** `ai-office/` 변경은 Vercel 배포에 아무 영향이
  없고, 반대도 마찬가지다. 본체 CI·테스트가 이 폴더를 돌리지 않는다.
- **커밋 범위 주의.** `ai-office/.gitignore` 가 이 폴더의 `node_modules` ·
  `dist` · `.wrangler` 를 제외한다(루트 `.gitignore` 에는 `ai-office` 언급이
  없고, 실제로 `git check-ignore` 로 세 경로가 모두 걸리는 것을 확인했다).
  `npm install` 후의 750MB 를 실수로 커밋하지 않도록 `git status` 를 먼저 본다.
- **라이브 URL**: https://godseng-ai-company-hq.hanazi8282.workers.dev/ —
  실시간 데이터 연동은 없다. 실제 루프 상태를 보는 화면은 본체의 `/agents` 다.

---

## 3. 아키텍처 원칙 (Architecture Principles)

### 3.1 공통 분석 파이프라인 (가장 중요한 추상화)
KPI·매출·Unit Economics·크리에이터 세일즈·퍼포먼스 마케팅 모듈은 **모두 같은 5단계 파이프라인**을 공유한다.
모듈마다 따로 만들지 말고, 이 엔진 1개에 **데이터 소스 어댑터 + 시각화 설정**만 다르게 꽂는다.

```
[수집(Adapter)] → [정규화/저장(DB)] → [시각화(Chart)] → [AI 인사이트] → [보고서 추출]
```

- "어려운 용어를 쉽게 풀어주고 개선안을 제시"하는 기능은 이 파이프라인의 **AI 인사이트 레이어**다. 모듈별 중복 구현 금지.
- 새 분석 모듈 추가 비용 = 어댑터 1개 + 시각화 설정. (엔진 재사용)

### 3.2 데이터 소스 연동 = Plan A (직접 연동)
각 플랫폼 공식 API를 **직접** 연동한다. (이지어드민 단일 허브 경유 안 함)
각 소스는 동일한 `SourceAdapter` 인터페이스를 구현한다: `fetch() → normalize() → upsert()`.

### 3.3 민감도(Sensitivity) 모델 — 인앱 제어
- 모든 분석 테이블/주요 필드는 `sensitivity` 등급 컬럼을 가진다: `public | internal | confidential | local_only`.
- 어드민 전용 **`민감도 관리` 패널**에서 등급을 인앱으로 수정 가능.
- 등급이 제어하는 것: (1) 역할별 접근(RLS) (2) 자동 마스킹(예: 원가→원가율 % 변환) (3) 내보내기 허용 여부.
- `local_only`는 v0.1에서 미사용. 향후 "클라우드 절대 불가" 데이터가 확정되면 그 필드만 별도 라우팅(스키마 자리 미리 확보).

### 3.4 인사이트 → 행동 강제
AI 인사이트는 "그렇구나"로 끝나면 안 된다. 인사이트는 **액션 아이템 카드**(담당자·마감)로 전환 가능해야 하고, KPI 모듈과 연결된다.

---

## 4. 데이터 소스 맵 (Data Source Map)

| 소스 | 코드 키 | 수집 방식 | 비고 |
|---|---|---|---|

**원칙:** 자동 소스는 매일 새벽 배치. 수동 소스는 드래그앤드롭 업로드 UI(CSV/XLSX 파서) 제공.

---

## 5. 권한 모델 — 현 상태와 계획을 섞지 않는다

이 절은 오래 **계획을 현재형으로** 적어 뒀다(진단 5-1). 그 문장을 근거로 민감 재무를
DB 에 넣었으면 그 순간 로그인한 전원이 열람할 수 있었다. 그래서 둘을 갈라 적는다.

### 5-1. 현 상태 (2026-09-16 실측)

**역할 구분이 없다. 로그인한 사람은 전원 같은 권한이다.**

- 로그인 = 이메일 허용목록 한 겹(`AUTH_ALLOWED_EMAILS`, 판정은 `lib/auth/policy.ts`).
  "누가 앱에 들어오나"만 막는다. 들어온 뒤의 구분은 없다.
- 앱의 DB 쿼리는 전부 `service_role`(`lib/supabase/server.ts`)이라 **RLS 를 우회한다.**
  RLS 는 앱 사용자 권한이 아니라 "브라우저 anon 키로 직접 PostgREST 를 때리는 것"을
  막는 용도로만 켜져 있다(정책 0개 = service_role 전용, `20260915000002`, PR #97).
- `super_admin` / `admin` / `member` / `brand_access[]` 는 **코드·스키마 어디에도 없다.**
  `CREATE POLICY` 도 마이그레이션 전체에 0건이다.
- **케이스 숨김(soft delete, `/cases` 숨김·복원) 권한 = 허용목록 전원(남헌 2026-09-28 결정 A).** 되돌릴 수 있고
  사유가 필수라 낮은 리스크로 판단해 관리자 역할(B안) 구축은 보류했다. **"일단"의 결정이다 — 허용목록 구성이
  바뀌면(예: 외부 베타유저 추가) 이 권한을 먼저 재검토한다.** 허용목록을 넓히는 변경은 §10.2 예외 3번(인증 경계)이기도 하다.

⛔ 그러므로 **민감 재무(원가 배합비·순이익 원장)를 지금 이 DB 에 넣지 않는다.**
   넣는 순간 허용목록에 있는 전원에게 열린다. 역할 분리가 실제로 생긴 뒤에 넣는다.

### 5-2. 계획 (아직 구현 없음)

역할 × 브랜드 2차원. 착수할 때 이 표를 5-1 로 옮기고 근거 파일을 함께 적는다.

| 역할 | 코드 | 매출·원가(민감) | 재고·물류 | KPI·콘텐츠 | 브랜드 범위 |
|---|---|---|---|---|---|
| 슈퍼어드민 | `super_admin` | ✅ 전체 + 민감도 설정 변경 | ✅ | ✅ | 4개 전체 |
| 어드민 | `admin` | ✅ 전체 | ✅ | ✅ | 4개 전체 |
| 팀원(내부) | `member` | 🟡 담당 브랜드만 | ✅ | ✅ | 배정 브랜드 |

필요한 것(순서대로): `user_roles(user_id, role, brand_access[])` 테이블 →
세션 클라이언트(anon+JWT)로 전환 → 테이블별 `CREATE POLICY`. 그때
`AUTH_ALLOWED_EMAILS` 는 첫 `super_admin` 부트스트랩용으로만 남긴다
(같은 계획이 `lib/auth/policy.ts` 헤더에 적혀 있다 — 두 곳이 갈라지면 그쪽이 정본이다).

---

## 6. 폴더 구조 (제안)

```
/app                  # Next.js App Router (라우트/페이지)
  /(auth)             # 로그인, SSO 콜백
  /dashboard          # 모듈별 페이지
/lib
  /adapters           # SourceAdapter 구현체 (smartstore.ts, coupang.ts ...)
  /engine             # 공통 분석 파이프라인 (collect/normalize/insight/report)
  /ai                 # Anthropic 호출 래퍼 (insight, content)
  /auth               # SSO, 권한 헬퍼
/components
  /ui                 # shadcn/ui
  /charts             # Recharts 래퍼
/supabase
  /migrations         # 스키마 (sensitivity 컬럼 포함)
  /functions          # Edge Functions (배치 수집, 주간 브리핑)
/docs
  CLAUDE.md           # 이 문서
  /prd                # 모듈별 PRD (phase1-sales.md ...)
```

---

## 7. 코딩 컨벤션

- 언어: TypeScript (strict). 함수형 React 컴포넌트 + Hooks.
- 데이터 페칭: Server Components / Route Handlers 우선. 클라이언트 상태는 최소화.
- 모든 외부 API 호출은 `/lib/adapters`에 격리. 페이지 컴포넌트가 직접 외부 API 호출 금지.
- 에러: 사용자 노출 메시지는 한국어, 로그는 영어. try/catch + 폴백 UI 필수.
- 커밋: Conventional Commits (`feat:`, `fix:`, `chore:`).
- 한 번에 한 모듈씩 **수직 슬라이스**로 완성(수집→DB→차트→AI까지 끝까지) 후 다음으로.

### 7.1 검사 규약 — "확인 실패"를 "정상"으로 보고하지 않는다

**존재·도달·성공을 확인하는 모든 검사는 세 상태를 구분한다: 양성 / 음성 /
확인 불가. 확인 불가를 양성으로 접지 마라. 구분할 수 없으면 실패로 보고한다.**

없는 검사보다 거짓 통과하는 검사가 나쁘다. 검사가 없으면 사람이 의심하지만,
초록불이 뜨면 믿고 그 위에 계속 쌓는다.

이 프로젝트에서 실제로 다섯 번 났다:

1. 파서가 본문 컨테이너가 사라져도 제목만 읽고 "정상 수집"으로 보고
2. Amazon 리뷰 페이지가 HTTP 200 인데 내용은 로그인 벽 — 상태 코드만 봤다
3. PostgREST `head:true` 가 없는 테이블에도 `error=null` / 204 — 검증기가
   존재하지 않는 테이블 4개를 ✅ 로 보고
4. 워크플로 "YAML 파싱 ok" 가 실은 탭 문자만 세고 있었다
5. 러너 테스트가 가짜 어댑터만 써서, 실제 어댑터와 붙였을 때의 버그 2건을
   못 잡았다

구체적으로 지킬 것:

- **상태 코드로 성공을 판정하지 마라.** 200 이 곧 원하는 내용은 아니다.
  기대하는 내용의 표지(marker)를 함께 확인한다.
- **비었을 때와 못 읽었을 때를 가르라.** 0건 파싱과 "10건 보이는데 0건"은
  다른 사건이다. 후자는 실패다.
- **검사 방법이 주장과 같은지 확인하라.** "파싱했다"고 적었으면 실제로
  파싱해야 한다.
- **부품 테스트를 통합의 근거로 쓰지 마라.** 각각 통과해도 붙이면 안 될 수
  있다. 경계면을 따로 테스트한다.
- **읽지 못한 규칙을 허용으로 해석하지 마라.** robots.txt 를 못 받았으면
  "허용"이 아니라 "판단 불가"이고, 그때는 가지 않는다.
  - 예외: 토큰 인증 공식 API 호스트 `api.producthunt.com`(Product Hunt)은 robots 확인 불가(403)여도 진행한다 — 어댑터 `proceedWhenRobotsUnverified` 등재, 5xx·타임아웃은 여전히 멈춤 (남헌 2026-09-29).

### 7.2 안전장치가 걸린 것을 정상으로 읽지 마라

위 7.1 은 **확인 실패를 양성으로 오인**하는 문제다. 이건 층위가 다르다.

**안전장치(상한·종료조건·타임아웃·폴백)가 정상 작동했다는 것과 그 안쪽
로직이 옳다는 것은 별개다. 안전장치가 걸렸을 때는 correctness 를 따로
확인하라.**

안전장치는 사고를 막으라고 있는 것이지 버그를 감추라고 있는 게 아니다.
그런데 잘 만든 안전장치일수록 잘못된 동작을 "적당히 멈춘 정상"처럼 보이게
만든다. 증상 자체를 흡수해 버린다.

실제 사례: 다나와 파서의 커서가 전진하지 않아 페이지 전진이 `1,2,2,2` 가
됐는데, 증분 종료(연속 5건)와 타깃당 페이지 상한(20)이 폭주를 막아 주는
바람에 로그에는 "이미 본 구간 도달"이라는 **정상 종료**로 찍혔다.
2페이지 이후를 영영 못 읽는 상태였다.

그래서:

- 안전장치가 걸려 끝난 실행은 성공이 아니라 **확인 대상**이다. 왜 걸렸는지
  본문을 보라.
- "상한에 걸렸다 / 조기 종료했다"를 로그에 남기되, 그게 예상된 것인지
  판단할 수 있는 수치(몇 페이지째, 몇 건째)를 함께 남겨라.
- 안전장치를 넣기 전에, 그것 없이도 정상 종료하는지 먼저 확인하라.

### 7.3 UI 작업 규칙 (2026-09-29 남헌 확정)

- **앱 UI**(케이스 목록·`/relevance/grade`·어드민 화면) → Impeccable **Operate** 모드, "기존 화면을 확장하는" 경로만.
  새 시각 세계·새 화면의 콘셉트 시드·결정 페이지는 **남헌이 참여하는 세션에서만** 만든다 —
  무인 루프(크론·nightshift)·서브에이전트에서는 금지.
- **랜딩·마케팅·카드뉴스** → Impeccable **Persuade** + `docs/design/landing-reference.md`.
  레퍼런스를 뜯어볼 때는 `docs/design/reference-study-protocol.md` 절차를 따른다.
- **ui-ux-pro-max 는 조회 전용.** `--persist` 금지. 디자인 정본은 **`DESIGN.md` 한 파일**뿐이다 —
  아직 리포에 없다(2026-09-29 실측). 남헌과 함께 `/impeccable document` 로 만든다. 세션이 임의로 만들지 않는다.
- **UI 변경 PR 은 web-design-guidelines 를 통과한 뒤에만 머지한다.**
  - UI 변경 = diff 에 `app/**/*.tsx` · `app/**/*.css`(`app/_ds/**`·`app/_pub/**` 포함)가 하나라도 있는 PR. `ai-office/` 는 제외(§2.1).
  - 통과 = 변경된 UI 파일 전부를 `/web-design-guidelines` 로 검사해 **위반 0건**(남기는 위반은 건마다 사유 한 줄).
    검사한 파일 목록·위반 수·검사 일시를 **PR 본문**에 적는다. 본문에 없으면 미검사다.
  - 이 스킬은 실행할 때마다 `raw.githubusercontent.com/vercel-labs/web-interface-guidelines` 에서 규칙을 받아온다.
    받아오기에 실패하면 "통과"가 아니라 **확인 불가**다(§7.1) — 그 상태로 머지하지 않는다.
- **`python`/`python3` 은 이 머신에서 Microsoft Store 스텁이다** — "Python" 한 줄 찍고 exit 0(조용한 실패).
  파이썬은 항상 `py -3` 으로 부른다. 스킬 문서의 `python3 …/search.py` 는 `py -3 .claude/skills/ui-ux-pro-max/scripts/search.py …` 로 읽는다.
- 위 스킬(impeccable · ui-ux-pro-max · web-design-guidelines · emil-design-eng · review-animations · mobile-native)과
  Playwright MCP 는 **이 머신 `.claude/skills/` 의 로컬 설치**이고 git 에 없다. 다른 머신·워크트리 세션에는 없을 수 있다.
  스킬이 없으면 게이트를 조용히 건너뛰지 말고 "스킬 없음 → 확인 불가"로 보고한다.

---

## 8. 도메인 용어집 (Glossary)

- **시딩(seeding):** 크리에이터에게 제품을 제공해 콘텐츠/판매를 유도하는 활동.
- **Unit Economics:** 제품 1단위의 원가율·비용 비중 구조.
- **ROAS:** 광고비 대비 매출. 퍼포먼스 마케팅 핵심 지표.
- **찐팬 / 영향력:** 크리에이터 이코노미 맥락의 충성 팬층·도달 영향력.
- **writing-protocol:** 브랜드별 콘텐츠 톤·문체 규칙 문서. SNS 엔진의 품질 연료. (Agent Skill로 재사용 가능)

---

## 9. 로드맵 (Phase)

- **Phase 0 — 뼈대:** SSO 로그인 + 좌측 네비 + 빈 대시보드 레이아웃 + 민감도 스키마.
  (RBAC 는 여기 적혀 있었지만 실제로는 안 했다 — §5-1. 미착수로 남아 있다.)
- **Phase 1 — 매출 + KPI:** 공통 분석 엔진을 여기서 완성. KPI는 Notion/Sheets 읽기 연동.
- **Phase 2 — Unit Eco + 크리에이터 ROI + 퍼포먼스 마케팅:** 엔진에 어댑터 추가(저비용).
- **Phase 3 — 재고 통합 + 물류 양식 변환:** 운영 도메인.
- **Phase 4 — SNS 콘텐츠 엔진:** 발행 직전 완성본까지 + 인앱 편집기 + 복사/내보내기. (자동발행 안 함)

---

## 10. SNS 콘텐츠 엔진 규칙 (Phase 4)

- 입력: 키워드 + 브랜드 + 채널(블로그/스레드/인스타).
- 처리: 브랜드별 `writing-protocol` 기반 AI 초안 생성 → **누구나 인앱 편집 가능**.
- 출력: "복사" 또는 "이미지 내보내기" → 사람이 각 플랫폼에 직접 발행.
- **무인 자동 발행 금지** (계정 제재 리스크 회피). 무인 루프·크론·서브에이전트는 어떤 SNS 발행 API 도
  호출하지 않는다. **로그인한 사람이 앱에서 직접 누르는 "즉시발행" 버튼은 허용한다**(남헌 2026-09-25 개정 —
  다듬는 단계만 생략하는 경로. 게이트 `lib/threads/instant-gate.ts` pass 에만 버튼이 뜨고, 누르는 것은 항상 사람이다).
  사람 최종 검수 필수.

### 10.1 에이전트 자동 DB 쓰기 허용 범위

무인 루프(`scripts/cmo-daily.mjs` 등)가 사람 승인 없이 할 수 있는 것과 없는 것.
**이건 권고가 아니라 권한 경계다** — 문서로만 적어 두면 지켜지지 않는다는 걸
이 리포에서 여러 번 확인했다. 그래서 각 항목은 코드·env·도구 목록으로 강제된다.

**허용 (무인 루프가 스스로 한다)**

- **케이스 적립** — `case_studies` / `case_moves` / `case_evidence` 에 INSERT.
  기본은 전부 `review_status='draft'` 로만 들어간다. **이 예외는 `case_studies`/`case_moves`
  의 `review_status` 에는 적용되지 않는다** — 구현 단계(2026-09-28, PR #311)에서 두 테이블에
  `input_id` 연결 컬럼이 없는 것이 확인돼, 범위를 판정 행 하나로 좁혔다(바로 아래). 케이스까지 넓히는 조건은 예외 2 다.
  **예외(남헌 2026-09-28 개정) — T2 완전 동의 자동 승인(규칙 `rr-v2`).** 1차 판정(`relevance-judge-auto`, claude-cli)과
  2차 판정(`relevance-second-judge-auto`, Gemini — 1차와 다른 계열)이 **같은 input_id 에 대해 독립적으로 둘 다
  `verdict='relevant'` 이고 둘 다 `product_informative=true`**(이 제품·경쟁/대체재를 판단할 구체 정보가 있다 —
  정의는 `lib/analysis/relevance-criteria.ts` PRODUCT_INFORMATIVE_CRITERIA 한 벌)인 건에 한해서만, 무인 루프가
  `review_relevance_verdicts.auto_approved_at`·`auto_approval_rule='rr-v2'` 를 직접 기록할 수 있다
  (`lib/analysis/auto-approval.ts` meetsRrV2·isFullAgreement). 아래를
  전부 지켜야 이 예외가 성립한다 — 하나라도 못 지키면 예외가 아니라 §10.1 위반이다.
  1. **완전 동의만.** `irrelevant`·`unknown`·정보없음·정보 판정 없음(null)이 하나라도 섞이거나 판정이 하나뿐이면 기존 규칙(`draft`)대로 간다.
  2. **가동 근거(2026-09-28 남헌 결정).** 기준 통일(t2d) 뒤 사람 채점 대조 평가(`scripts/t2-approval-eval.mjs`)에서
     승인 예측 30건 · 오류 2건 · 정밀도 93.3% · 재현율 96.6%(30건 중 26건은 추정 정답). 문서화된 문턱(승인 예측 ≥40)에
     못 미쳤지만 **남헌이 26건 기준으로 가동을 결정**했다. 리포 변수 `AUTO_APPROVAL_ENABLED=true`,
     `AUTO_APPROVAL_SINCE`(새 프롬프트 머지 뒤 시각) 이전에 판정된 행은 대상이 아니다. 기준 문구를 바꾸면(버전 올림) 같은 하네스로 다시 잰다.
  3. **감사 표본이 상시로 돈다.** 자동 승인된 건 중 매일 일부를 사람이 사후 검수한다(2026-09-28
     지시 2번의 감사 루프). 이건 "출시 초반 확인용"이 아니라 **이 예외가 살아있는 한 계속 도는
     상시 조건**이다 — 사람 검토를 없앤 자리를 대신 지키는 유일한 장치이기 때문이다.
  4. **자동 킬스위치.** 감사 정확도가 문턱 아래로 떨어지면(설계 문서에 구체 수치·연속 기간을
     명시한다) 이 경로를 스스로 끄고 `draft` 로 되돌아간다 — 사람이 내리기 전에 기계가 먼저 멈춘다.
  5. **범위는 관련성 자동 승인 하나뿐이다.** `evidence_grade`·발행·`case_moves` 별도 승인 버튼
     (`[/cases 승인 버튼이 둘]`)에는 이 예외가 미치지 않는다. 그건 여전히 사람이 한다.
  근거·설계는 `reports/2026-09-28/` 아래 승인 자동화 설계 문서가 정본이다. 이 예외는 그 설계가
  구현한 정확한 조건(테이블·컬럼·킬스위치 수치)을 반드시 따른다 — 이 문단은 승인 조건만 못박고,
  구현 세부는 설계 문서에 위임한다.
  **예외 2(남헌 2026-09-28 개정) — 케이스 무브 자동 승인 `ca-v1`.** 무인 루프가 `case_moves.review_status` 를
  `draft`→`approved` 로, 그 케이스의 무브가 전부 approved 일 때 `case_studies.review_status` 를 `approved` 로 쓸 수 있다.
  조건은 설계 `reports/2026-09-28/case-approval-linkage-design.md` §4 의 여섯 가지(연결 VOC ≥3건·같은 project_id·전부
  승인 · `metric_after IS NULL` · `outcome_direction <> 'negative'` · `transfer_note`·`preconditions` 기재 · draft ∧
  `reviewed_by IS NULL`)이고, 하나라도 못 지키면 §10.1 위반이다. 코드 `lib/cases/case-auto-approval.ts`, 집행 `scripts/case-auto-approve.mjs`.
  - **가동 전제 3개 — 전부 충족 전에는 `CASE_AUTO_APPROVAL_STAGE=off`(기본값)를 유지한다.**
    (a) VOC 연결 케이스가 실제로 생산되고 있다(`case_move_inputs` 적용 + 연결 VOC ≥3건 draft 무브가 쌓인다),
    (b) 현재 운영 조합의 `rr-v1` 사람 감사가 정확도를 확인했다(로드맵 §2-2 문턱),
    (c) 어드민 케이스 삭제 기능이 있다. 그 위에 로드맵 `docs/case-approval-automation-roadmap.md` §2 진입 조건표를 따른다.
  1. **쓸 수 있는 컬럼은 이것뿐이다**: `case_moves.review_status`·`auto_candidate_at`·`auto_approved_at`·`auto_approval_rule`,
     `case_studies.review_status`·`auto_approved_at`·`auto_approval_rule`. `reviewed_by`·`review_note`·`transferability`·등급은 사람만 쓴다.
  2. **2단계(`candidate`)** 에서는 `auto_candidate_at` 만 쓴다. 상태는 사람이 바꾼다.
  3. **감사·킬스위치**는 T2 와 같은 구조로 따로 돈다(로드맵 §3: 창 30 · 반려 4건 · 최근 14일 감사 8건 미만이면 확인 불가,
     `rr-v1` 이 닫히면 같이 닫힘, `case_move_inputs` 가 없거나 못 읽으면 닫힘). 걸리면 신규 승인 0건이고
     **`auto_approval_rule='ca-v1' ∧ reviewed_by IS NULL ∧ review_status='approved'` 인 행을 `draft` 로 되돌린다**(태그
     `ca-v1:reverted`). 사람이 본 행은 건드리지 않는다. 이 되돌리기 UPDATE 는 여기 적어 두는 것으로 허가한다.
  4. **낮은 노출.** 자동 승인 ∧ `reviewed_by IS NULL` 케이스는 공개 목록에서 검증된 케이스 아래로 가고 '검증중' 배지를 단다.
     사람이 불시검수에서 맞다고 결정하면(`reviewed_by` 기록) 정식 노출로 올라간다. 사람 승인 케이스는 영향 없다.
  5. **단계를 올리는 것은 사람·역할 세션만 한다**(리포 변수 `CASE_AUTO_APPROVAL_STAGE`·`CASE_AUTO_APPROVAL_SINCE`).
     기계는 내리기만 한다. 3단계(`approve`) 진입은 사람 판단 예외다(로드맵 §5).
  6. 조건 5 의 "범위는 관련성 자동 승인 하나뿐" 은 이 예외 2 를 더한 것으로 읽는다. `evidence_grade`·발행·이식성에는 미치지 않는다.
- **초안 staging** — `content_items`(`status='proposed'`) / `posts`
  (`status IN ('draft','pending_review')`, **`published_at` 은 항상 NULL**).
- **조사 큐·실행 상태** — `research_queue` / `agent_runs` / `agent_run_steps`.
- **발굴 적재** — `discovery_candidates` 전체 / `analysis_projects`(`status='collecting'` 신규 INSERT 한정, UPDATE·DELETE 금지) / `review_targets`(`review_sources.enabled=true` 인 소스 한정). 무인 루프는 `review_sources` 에 INSERT/UPDATE 하지 않는다. **새 소스는 대화형·역할 세션이 스스로 찾아 마이그레이션으로 등록한다**(남헌 2026-09-30 — 사람이 하나씩 고르던 병목 제거, 09-20 자율 승인과 같은 취지):
  법적 점검(`docs/review-collection-design.md` §1.2 — robots 3상태 · 약관 자동수집 조항 인용 · 로그인/유료벽 · 개인정보 비중)을 **전부 깨끗하게 통과한 무료 소스만** 바로 등록한다.
  하나라도 걸리거나 **확인 불가**면 등록하지 않고 `ops/state/source-review-queue.md`(사람 판단 큐)에 올린다 — §10.2 예외 4번(새 법적 리스크)이 이 큐다.
  등록한 소스의 수집분도 T1~T4 게이트를 그대로 거친다(우회 경로 없음).
  (남헌 2026-09-17 승인 — 자율 VOC 발굴 엔진. 사람이 `review_targets` 를 하나씩
  등록하던 병목을 없애려고 이 한 줄을 열었다. 근거는 `docs/discovery-design.md`.
  **채택은 LLM 의 주장이 아니라 실측 hits 가 정한다** — 그게 이 권한을 준 조건이다.)
- **요청 상한 자동 반영** — 위 "`review_sources` 에는 INSERT/UPDATE 하지 않는다" 의 **유일한 예외**(남헌 2026-09-24 지시): `review_sources.daily_request_cap` **한 컬럼**만, **현재값의 2배 이내**로만, `review_source_cap_log` 에 **감사 로그 행을 남긴 변경만**(로그 테이블 미적용이면 반영하지 않는다). 권장값이 2배를 넘으면 보류로 보고만 한다. 계산은 `lib/review/request-cap.ts`, 집행은 `scripts/review-request-cap.mjs`(nightly-review-collect pre-step). 상한을 **내리는 변경은 자동으로 하지 않는다.**
- **수집 램프 단계 자동 기록**(남헌 2026-09-28 승인) — 무인 루프는 `review_source_ramp`(소스별 현재 단계·1회 타깃 수·동결 기한)와
  `review_source_ramp_log`(변경 이력)를 스스로 쓸 수 있다. 단계를 올리는 것과 **안전 되돌리기(직전 단계로 내리고 동결)** 둘 다
  허용한다 — 위 cap 의 "내리는 변경 금지"와 달리 이건 차단 신호에 대한 안전장치라서다. 조건: 모든 변경은 ramp_log 에 행을 남긴다
  (로그 없이 바꾸지 않는다), 차단 이력 소스(todayhumor 등)와 남헌이 속도를 정해 둔 소스(danawa, 09-27 최소화)는 대상이 아니다,
  근거 수치는 `review_collection_runs.blocked_responses`·`quota_responses`(000033 이후 행만 측정값)다. 정책은
  `reports/2026-09-28/cowork-four-orders.md` §2-2. `review_sources` 자체는 여전히 건드리지 않는다.
- **reports/ 파일** — `reports/` · `drafts/cases/` · `drafts/threads/` · `ops/state/`
  4개 프리픽스에만 커밋한다. 그 밖의 경로가 스테이징에 있으면 커밋하지 않고 실패한다.

**금지 (사람만 한다)**

- **승인·등급 변경** — `review_status` 를 `approved`/`rejected` 로 바꾸는 것,
  `evidence_grade` 를 손으로 올리는 것. (`regrade` 는 근거에서 계산하는 것이라
  별개이고, 그것도 사람이 실행한다.) **예외는 위 "T2 완전 동의 자동 승인"과 예외 2(케이스 무브 `ca-v1`) 둘이다**
  (남헌 2026-09-28 개정, 각 조건 전부 충족 시) — 그 밖의 모든 승인·등급 변경은 사람이 한다.
- **발행** — 무인 루프는 어떤 SNS 발행 API 도 호출하지 않는다. 무인 루프의 환경에
  `THREADS_ACCESS_TOKEN` 자체가 없다. 정책이 아니라 구조다. (사람이 앱에서 누르는
  즉시발행 버튼은 §10 개정대로 허용 — 토큰은 Vercel 런타임에만 있다.)
- **마이그레이션 적용** — 무인 루프에는 그 권한이 없고 도구도 부여하지 않는다
  (Supabase MCP 미부여). 스키마 변경이 필요하면 파일만 만들고 "미적용"을
  보고에 명시한다. **누가 적용할 수 있는지는 §10.2 가 정한다**(2026-09-20 부터
  대화형·역할 세션은 자체 판단, 예외 5개만 사람) — 무인 루프는 어떤 경우에도 적용하지 않는다.
- **`methodology/` 수정** — MANIFEST md5 대조가 걸린 append-only 아카이브다.
  커밋 화이트리스트 밖이라 스테이징 단계에서 막힌다.

**서브에이전트는 DB 를 아예 못 만진다.** LLM 이 조종하는 자식 프로세스에는
`SUPABASE_SERVICE_ROLE_KEY` 를 넘기지 않는다(env 화이트리스트). DB 를 만지는 일은
전부 오케스트레이터가 하며, 그 경로가 한 파일에 모여 있어 사람이 검토할 수 있다.

### 10.2 마이그레이션 적용 · PR 머지를 누가 결정하나 (2026-09-20 개정)

**가르는 기준은 "되돌릴 수 있는가"다.** 2026-09-17 개정까지는 "남헌에게 물을 수
있는가"가 기준이었고 대화형 세션도 건마다 승인 1회를 받았다. 2026-09-20 남헌 지시로
**정말 위급한 사안만 사람 판단으로 남기고 나머지는 세션이 자체 판단해 적용·머지한다.**

| 주체 | 마이그레이션 적용 · PR 머지 | 조건 |
|---|---|---|
| 남헌 | ✅ | Dashboard SQL Editor 또는 `supabase db query --linked -f` |
| 남헌이 직접 모는 대화형 세션 | ✅ **자체 판단** | 아래 "사람 판단 예외" 밖이면 CI 통과 확인 후 스스로 승인·적용·머지. 예외에 걸리면 Notion 에 `사람판단필요=true` 로 올리고 기다린다 |
| CMO · CTO · CEO-STAFF 역할 세션 | ✅ **자체 판단** | 위와 같다. 남헌에게 직접 묻지 않는다(`_principles.md §8`) — 예외 건은 CEO-STAFF 큐로 |
| 서브에이전트(Task) | ⛔ | 판단 주체가 아니다. 파일만 만들고 "미적용" 보고 |
| 무인 루프(GitHub Actions) | ⛔ | 물어볼 사람이 없다. 도구·권한이 설정 레벨에서 없다 |

**사람 판단 예외 — 이건 세션이 스스로 결정하지 않는다** (남헌 2026-09-20 지정)

- 되돌리기 어려운 삭제 — `DROP TABLE` · `DROP COLUMN` · 데이터 DELETE · 컬럼 타입 축소
- 프로덕션 데이터 손상 위험 — 백필·대량 UPDATE·제약 변경으로 기존 행이 깨질 수 있는 것
- 보안 키·크리덴셜 노출 — env·시크릿·인증 경계(`lib/auth/*`·`proxy.ts`·cron-auth)를 넓히는 변경
- 새로운 법적 리스크 — 약관 위반 소지 있는 스크래핑 소스 **신규 추가**, 자동 발행 API
- 사업 방향 결정 — 가격 정책·브랜딩·타깃 독자 정의 변경

**자율 승인은 한 방향으로만 쓴다.** 사람 판단 대기 중인 항목을 저위험이라 판단해
진행하는 것은 허용된다. 남헌이 **이미 명시적으로 지시해 둔 것**(예: 다나와 리뷰 수집
유지)을 세션의 위험 판단으로 되돌리거나 축소·중단하는 것은 허용되지 않는다 — 바꿔야
한다고 판단되면 직접 되돌리지 말고 Notion 에 `사람판단필요` 로 먼저 묻는다.

**자율 승인의 조건 — 기록.** 무엇을 왜 승인했는지 Notion "일일 상태 로그"(§11)에
**예외 없이** 적는다. PR 번호·마이그레이션 파일·판단 근거 한 줄. 기록이 빠지면 이 권한은
회수된다(남헌 2026-09-20).

**적용하는 세션이 지킬 절차**

1. **무엇을 적용하는지 먼저 적는다** — 파일 경로, 대상 프로젝트, 비파괴 여부,
   롤백 파일 유무, 그리고 **위 예외 5개에 걸리지 않는 이유**. 예외에 걸리면 여기서 멈추고 묻는다.
2. **대상 프로젝트를 확인한다** — solutionarchive `qmgrfqjfxqhxuufrnkwf`.
   ⚠️ 로컬 stdio `supabase` MCP 는 2026-09-14 부터 Cowork·SolutionArchive 스코프 모두
   solutionarchive 를 가리킨다(2026-09-24 CEO-STAFF 실측 확인 — Dothegy OS 고정은 옛말).
   다만 claude.ai 호스티드 Supabase MCP 는 계정 전체(3 프로젝트)를 보므로 `project_id` 를
   반드시 명시하고, 돌아온 스키마가 이 리포의 것인지
   (`content_columns`·`case_studies`·`agent_runs` 등) 눈으로 확인한다. 발주·공장
   테이블이 보이면 잘못된 프로젝트다.
3. **적용 전에 현재 상태를 실측한다** — 대상 테이블·컬럼이 이미 있는지,
   부분 적용 흔적이 없는지. 선행 마이그레이션이 들어가 있는지.
   존재 확인은 `information_schema` 로 한다 — PostgREST `head:true` 는
   없는 테이블에도 204 를 준다(§7.1).
4. **적용 후 양성·음성을 직접 돌린다.** 도구가 준 `success` 만으로 보고하지
   않는다. 마이그레이션 파일 하단의 확인 쿼리가 그 용도다. 음성 검사는
   롤백되는 형태로 돌려 데이터를 남기지 않는다.
5. **`docs/migration-exceptions.md` 에 한 줄 남긴다** — 날짜·파일·승인자·검증 결과.

적용 이력은 `docs/migration-exceptions.md` 에 쌓는다.

**워크플로 파일(`.github/workflows/*.yml`) 수정·머지 — 2026-09-27 남헌 확정, 자율 범위에 포함**

- 위 표의 "자체 판단" 주체는 워크플로 파일도 스스로 고치고 머지한다. 조건은 대량 UPDATE 와 같은 4개다.
  (1) 드라이런 — 셀프테스트(`scripts/cron-watchdog-selftest.mjs` 등)를 먼저 돌리고, 돌릴 수 있는 것은
  `workflow_dispatch` 로 한 번 실행해 본다. (2) 되돌리기 — 이전 커밋 revert 로 돌아갈 수 있어야 하고
  PR 본문에 되돌리기 한 줄을 적는다. (3) 무중단 — 돌고 있는 실행을 끊지 않는다(`concurrency` 유지,
  스케줄 슬롯 사이에 머지). (4) Notion 일일 상태 로그에 기록.
- 여전히 사람 판단: 시크릿·권한을 **넓히는** 변경 — 새 secret 을 env 에 넣기, `permissions` 확대,
  발행 자격증명 주입(위 예외 3번 그대로). 이미 있는 시크릿을 같은 목적으로 다른 워크플로에 복사하는
  것(예: `BOT_APP_*` 봇 토큰 블록)은 넓히는 게 아니다.
- 배경: 09-25 main 룰셋 뒤 봇 push 워크플로 3개가 이틀 연속 push 단계에서 실패했는데(GH013),
  패치가 사람 몫이라 하루 더 늦어졌다. `scripts/cron-watchdog.mjs` 가 이 누락을 정적으로 잡는다.

**변경 이력**
- 2026-09-17: "사람만 적용" → 남헌 승인 1회를 받은 대화형 세션도 적용(그 전 1회성 예외 6회는 위 문서에).
- 2026-09-20: 남헌 지시 — 마이그레이션 적용 · Vercel PR 머지를 세션 **자체 판단**으로 확대. 사람 판단은
  위 예외 5개(되돌리기 어려운 삭제 · 프로덕션 데이터 손상 · 키 노출 · 새 법적 리스크 · 사업 방향)만.
  조건은 Notion 일일 상태 로그에 예외 없는 기록. 기존 명시 지시를 위험 판단으로 되돌리는 것은 불허.

---

## 11. 세션 마무리 — 일일 상태 로그 기록 (필수)

Cowork 아침 브리핑(매일 07:00 KST)은 사람이 보고를 붙여넣지 않고 Notion
"일일 상태 로그" DB 만 읽는다. **기록이 빠진 세션의 작업은 다음 날 브리핑에
존재하지 않는다.** 그래서 크론 루프(CMO/CTO)뿐 아니라 **사람이 직접 모는 대화형
세션도 끝내기 전에 반드시 행 1개를 남긴다.** 기억에 맡기지 않는다 — 아래
체크리스트를 통과하지 않은 세션은 끝난 것이 아니다.

- DB: 부모 "Solution Archive Reference database" · database
  `f57ae10b-4cc0-433b-9db6-20785216aebe` · data source
  `collection://bf9f5b49-fc4d-432b-a33c-adebf689ab64`
- 제목 `YYYY-MM-DD-<트랙>` (KST 날짜, 같은 날 같은 트랙 두 번째부터 `-2`, `-3`)
- 날짜 · 트랙(`CMO` / `CTO` / `기타` — 역할 세션은 그 트랙, CEO-STAFF·역할 없는 세션은 `기타`)
- 한일 · 막힌것 · 다음할일: 각 3~5줄 한국어. 커밋 해시·내부 용어보다 결과 위주
- 사람판단필요: 사람이 답해야 할 미결 판단이 하나라도 있으면 true
- 비고: PR 번호, 세션 이름 등 추적용
- **`알림완료` 는 쓰지도 읽지도 않는다.** Cowork 즉시 알림 시스템 전용이다. 새 행은 비워 둔다.

**세션 종료 직전 체크리스트**

1. **행 작성.** 대화형 세션은 Notion MCP `notion-create-pages`(parent `data_source_id`
   위 값)로 쓴다 — 로컬에는 `NOTION_API_TOKEN` 이 없다. 무인 루프는
   `scripts/notion-status-log.mjs`(GitHub Actions secret `NOTION_API_TOKEN`)로 쓴다.
2. **재확인.** 생성 응답만 믿지 않는다. `notion-fetch` 로 그 페이지를 다시 읽어
   제목·트랙·날짜가 들어갔는지 본다 (§7.1).
3. **실패하면 그대로 보고한다.** 기록 실패·확인 불가를 성공으로 추정하지 않는다.
   Notion 에 못 쓰면 같은 내용을 `ops/state/status-log-pending/<제목>.md` 에 남기고
   사람에게 알린다. 다음 세션이 체크리스트 1번 전에 이 폴더부터 올린다.
4. 같은 날 크론 루프 행이 이미 있어도 대화형 세션은 **별도 행**을 남긴다.
5. **`사람판단필요 = true` 인 세션은 Hermes Inbox에도 동시 기록** (2026-09-21 확정,
   Cowork `cowork/AGENT.md` §5-2 하이브리드 캡처의 즉시 캡처 절반). 일일 상태 로그와
   별개로 Notion MCP `notion-create-pages`로 Hermes Inbox DB
   (`collection://8f384b19-6223-4d6b-8a04-991b2e7d1d83`)에 행 1개 추가:
   - Name: 일일 상태 로그와 같은 제목(`YYYY-MM-DD-<트랙>`)
   - Domain: 이 세션 성격에 맞는 C/M/W/D 1개 이상 (자동화·인프라 작업이면 보통 `D`)
   - Source: "SolutionArchive 세션 (즉시 캡처, 사람판단필요=YES)" + 커밋/PR 링크
   - Synced to Local: 비워 둔다 (Cowork 쪽 Pass 0이 다음 대화형 세션에서 흡수)
   - 이 행은 **일반화된 인사이트 주장이 아니라 원시 기록**이다 — semantic 승격 여부는
     Cowork 쪽 curator가 판단하며, 여기서는 판단하지 않는다.
   - 노이즈 방지: `사람판단필요 = false`인 일상적 크론/잡무 세션은 이 5번을 건너뛴다 —
     그런 것들은 Cowork `weekly-review-monday` Pass 0.5(주간 배치)가 알아서 훑는다.
   - 이 단계 실패 시에도 일일 상태 로그(1~4번)는 정상 완료로 취급한다 — 이 5번은
     보너스 캡처이지 세션 종료 조건이 아니다. 실패하면 그냥 스킵하고 다음 세션에 넘긴다.

---

## 12. 미확정 / 확인 필요 (작업 전 사용자 확인)

- [ ] "외부 절대 불가" 데이터의 구체 목록 (정해지면 `local_only` 라우팅 설계).
- [ ] KPI/운영 자료가 Notion인지 Google Sheets인지, 각 위치·구조.
- [ ] "보고서 추출"의 수신자/포맷 (투자자용 PDF? 내부 회고용?).
