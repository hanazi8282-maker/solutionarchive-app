# `app/_pub` — 공개 화면 디자인 시스템 (A1)

남헌 2026-09-23 확정(B안): 공개 화면 8개를 **두더지웍스(`app/_ds`) 흔적이 없는 새 DS** 로 옮긴다.
레퍼런스 실측은 `reports/2026-09-23/ui-overhaul-reference-plan.md §2` — 다크 랜딩 = Foreplay,
라이트 앱 = Trend Seeker.

- **A1(이 PR)**: DS 기반 + 랜딩 `/` + `/login`
- **A2**: `/library` · `/library/[slug]` · `/library/saved`
- **A3**: `/onboarding/quiz` · `/columns/read` · `/columns/read/[slug]`

## 규칙 (넘어오는 에이전트가 먼저 읽을 것)

1. **`_pub` 는 `_ds` 를 import 하지 않는다.** 토큰 이름·값도 재사용하지 않는다.
   예외 하나: 폰트 변수 `--font-pretendard`(app/layout.tsx 의 next/font/local 소유).
2. **`app/layout.tsx` 를 수정하지 않는다.** `_pub` CSS 는 `PubShell` 이 `import '../pub.css'` 로
   끌어온다. 페이지가 CSS 를 따로 import 할 필요가 없다.
3. **인라인 스타일 금지.** `pub.css` 의 클래스만 쓴다. 새 모양이 필요하면 `pub.css` 에 클래스를
   추가하고 이 문서에 적는다.
4. 색·크기는 리터럴로 적지 않는다. `tokens.css` 의 변수(`--pub-*`)만 쓴다.
5. **테마 분기를 컴포넌트에 넣지 않는다.** 두 테마가 같은 변수 이름을 쓰고, `Panel` 안에서는
   변수가 라이트로 뒤집힌다. 그래서 다크 캔버스 위 흰 카드 안의 버튼이 자동으로 검은 알약이 된다.

## 컴포넌트 API

| 컴포넌트 | 파일 | props | 비고 |
|---|---|---|---|
| `PubShell` | `components/PubShell.tsx` | `theme: 'dark'\|'light'` · `children` · `footerNote?: string` | **async 서버 컴포넌트.** 테마 스코프 + `PubNav` + `<main>` + `Footer`. `getAuthVerdict()` 를 여기서 한 번만 부른다. 섹션 사이 간격(gap 56)을 이 컴포넌트가 정한다 |
| `PubNav` | `components/PubNav.tsx` | `email: string \| null` | 목적지 3개(라이브러리·칼럼·로그인\|대시보드). 판정은 받아 쓴다(자체 조회 금지). 표시용 이메일이고 접근 차단은 `proxy.ts` 몫 |
| `Hero` | `components/Hero.tsx` | `title: string` · `eyebrow?` · `lead?` · `actions?: ReactNode` · `note?: string` | **h1 을 만드는 유일한 컴포넌트** — 한 페이지에 하나. 100vh 안 쓴다 |
| `Section` | `components/Section.tsx` | `title?` · `eyebrow?` · `lead?` · `children?` · `id?` | 제목은 h2 고정. 바깥 여백을 스스로 주지 않는다 |
| `Panel` | `components/Panel.tsx` | `title?` · `eyebrow?` · `tone?: 'card'\|'banner'\|'alert'` · `titleAs?: 'h2'\|'h3'` · `children?` · `id?` | 흰 섬. `card` radius 16 / `banner` radius 32 + 가운데 정렬 / `alert` 좌측 굵은 선. 제목 기본 h3(배너는 h2) |
| `PubButtonLink` | `components/Button.tsx` | `href` · `children` · `variant?: 'primary'\|'ghost'` · `size?: 'md'\|'lg'` · `external?: boolean` | 내부는 `next/link`, `external` 이면 새 탭 `<a>` |
| `PubButton` | `components/Button.tsx` | `children` · `variant?` · `size?` · `type?: 'submit'\|'button'` · `name?` · `value?` | 폼 제출용. **onClick 을 받지 않는다**(받으면 클라이언트 컴포넌트가 되어 서버 컴포넌트에서 못 쓴다) |
| `Chip` | `components/Chip.tsx` | `children` · `tone?: 'quiet'\|'solid'` · `title?` | 뜻은 글자로 적는다. 색으로만 상태를 말하지 않는다 |
| `Stat` / `StatRow` | `components/Stat.tsx` | `Stat`: `label` · `value: string` · `caption?` / `StatRow`: `children` | `value` 가 문자열인 이유: 집계 실패를 `0` 으로 접지 않는다(§7.1, "집계 불가"를 그대로 넘긴다) |
| `Footer` | `components/Footer.tsx` | `note?: string` | 링크 4개 + 상태 한 줄 |
| `PubProgress` | `components/PubProgress.tsx` | `value: number` · `max: number` · `label: string` | **A3.** 네이티브 `<progress>` — 채운 폭을 인라인 스타일로 주지 않으려고(규칙 3). `label` 을 막대 위에 글자로도 적는다 |
| `PubChoice` | `components/PubChoice.tsx` | `children` · `onClick: () => void` · `eyebrow?` · `disabled?` | **A3. `'use client'`** — 퀴즈 선택지 흰 카드. 진짜 `<button>` 이라 키보드·포커스가 공짜다. onClick 을 받으므로 서버 컴포넌트에서는 못 쓴다(`PubButton` 과 나뉜 이유) |
| `PubArticle` | `components/PubArticle.tsx` | `html: string` | **A3.** `renderMarkdown()` 결과를 받는 긴 글 타이포(h2/h3·인용·목록·표·코드, 폭 `--pub-measure`). 무해화는 `lib/columns/markdown.ts` 가 한다 — 여기서 또 하지 않는다 |
| `PubColumnCard` | `components/PubColumnCard.tsx` | `href` · `title` · `summary` · `readerType` · `date` | **A3.** 칼럼 목록 카드(제목 h3). `.pub-case` 를 재사용하지 않는다 — 그쪽은 A2 가 케이스 카드로 키운다 |

## 토큰 (`tokens.css`)

| 묶음 | 변수 | 값 |
|---|---|---|
| 타입 | `--pub-size-display` / `-display-sm` | 56 / 40 (≥768px 에서 56) |
| | `--pub-size-head` / `-head-sm` | 28 / 22 |
| | `--pub-size-text` / `-text-sm` / `-caption` | 17 / 15 / 13 |
| 간격 | `--pub-gap-1 … -20` | 이름의 숫자 × 4px (4pt 리듬) |
| 곡률 | `--pub-round-banner/card/control/pill` | 32 / 16 / 10 / 999 |
| 그림자 | `--pub-lift-1` · `--pub-lift-2` | 2단 |
| 모션 | `--pub-motion-quick/base/ease` | 110ms / 220ms / cubic-bezier. `prefers-reduced-motion: reduce` 면 둘 다 0ms |
| 다크 | `--pub-canvas #020308` · `--pub-ink #fff` · `--pub-cta #fff` | Foreplay 실측 |
| 라이트 | `--pub-canvas #f4f7fa` · `--pub-ink #0f172a` · `--pub-cta #0f172a` | Trend Seeker 실측 |
| 흰 섬 | `--pub-island #fff` · `--pub-island-ink #0f172a` · `--pub-island-edge #e2e8f0` | 두 테마 공통 |

**액센트 색이 없다(의도).** 지금은 잉크 단색 CTA다 — 브랜드 색은 사업 방향 결정(CLAUDE.md §10.2
사람 판단 예외)이라 에이전트가 고르지 않는다. 정해지면 `--pub-cta` / `--pub-cta-ink` 두 줄이 입구다.

## A2·A3 가 먼저 결정해야 할 것

1. **헤더가 두 개 겹친다.** `_ds/AppNav` 는 `/` · `/login` · `/onboarding` 에서만 스스로 숨는다
   (`app/_ds/components/AppNav.tsx` 첫 줄 판정). `/library` · `/columns/read` 를 `PubShell` 로
   감싸면 `AppNav` + `PubNav` 가 같이 나온다. 선택지 둘:
   (a) `AppNav` 의 숨김 조건에 그 경로를 더한다 — 로그인한 내부 사용자가 그 화면에서 사이드바를
   잃는다(라이브러리는 내부 검수자도 본다). (b) `PubShell` 에 헤더를 빼는 prop 을 만든다.
   **어느 쪽이든 `app/layout.tsx` 는 계속 건드리지 않아도 된다.**
2. **`.sa-main` 좌측 여백.** `_ds/styles.css` 가 `body:has(.sa-sidebar) .sa-main` 에 사이드바 폭을
   민다. 사이드바가 남는 화면에서 `_pub` 본문 폭이 그만큼 줄어든다 — 1번을 (a)로 풀면 같이 없어진다.
3. **카드**. 랜딩의 `.pub-case`(케이스 한 줄)가 A2 그리드 카드의 씨앗이다. `_ds/CaseCard` 를
   import 하지 말고 `.pub-case` 를 키워라. 로고 썸네일은 `case_studies.logo_url` 컬럼이
   **없는 환경도 있다**(마이그 20260930000001) — `loadLibrary` 의 `logo_columns` 를 보고 갈라야 한다.
4. **데이터 로더는 이미 있다.** `lib/cases/library.ts`(그리드) · `lib/cases/detail.ts`(상세) ·
   `lib/cases/grade-display.ts`(등급 라벨). 화면만 갈아 끼우고 로더는 새로 쓰지 않는다.
5. **`/library/saved` 는 스스로 로그인 판정을 한다**(정책 접두사가 proxy 를 통과시킨다).
   화면을 옮길 때 그 가드를 지우지 마라.

## A3 가 정한 것 (2026-09-23)

1. **헤더 중복은 (a) 로 풀었다** — `app/_ds/components/AppNav.tsx` 에
   `if (path.startsWith('/columns/read')) return null` 한 줄을 더했다(`app/layout.tsx` 는 그대로).
   (b)(`PubShell` 에 헤더 빼는 prop)를 안 고른 이유: 그래도 `AppNav` 가 렌더되어
   `.sa-main` 좌측 여백이 남고 본문 폭이 사이드바만큼 줄어든다(위 주의 2번).
   접두사를 `/columns/read` 로 좁혀 검수 화면 `/columns` 는 네비를 그대로 쓴다.
   **A2 가 `/library` 에 같은 해법을 쓰면 이 파일에서 만난다** — 두 줄은 서로 독립이니
   충돌하면 양쪽을 남기면 된다.
2. **온보딩만 다크다.** 다크 랜딩의 "내 문제로 시작"에서 이어지는 첫 화면이라
   `PubShell theme="dark"` 이고, 읽고 누르는 부분(선택지·결과·공유 이미지)은 흰 섬으로
   뒤집었다. 칼럼 목록·본문은 `theme="light"`.
3. **`pub.css` 는 파일 끝 A3 블록으로만 덧붙였다**(기존 규칙 0줄 수정):
   `.pub-progress` · `.pub-choice` · `.pub-column-list` · `.pub-column-card` · `.pub-article` ·
   `.pub-quiz`(폭 760 — `.pub-solo` 480 은 선택지 두 장이 안 들어간다) · `.pub-share-img` ·
   `.pub-column-foot`. `app/columns/read/column-read.css`(`.sa-column`)는 지웠다.
4. **클라이언트 화면을 옮기는 법.** `PubShell` 이 async 서버 컴포넌트라 `'use client'` 페이지가
   직접 감쌀 수 없다. 온보딩 퀴즈는 `page.tsx`(서버, 껍데기) + `quiz-client.tsx`(상태·fetch)로
   갈랐다 — 같은 상황이 또 오면 이 모양을 쓴다.
