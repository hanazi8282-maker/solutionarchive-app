# `app/_pub` — 공개 화면 디자인 시스템 (A1)

남헌 2026-09-23 확정(B안): 공개 화면 8개를 **두더지웍스(`app/_ds`) 흔적이 없는 새 DS** 로 옮긴다.
레퍼런스 실측은 `reports/2026-09-23/ui-overhaul-reference-plan.md §2` — 다크 랜딩 = Foreplay,
라이트 앱 = Trend Seeker.

- **A1**: DS 기반 + 랜딩 `/` + `/login`
- **A2**(완료): `/library` · `/library/[slug]` · `/library/saved` · `/library/methodology`
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
| `Hero` | `components/Hero.tsx` | `title: string` · `eyebrow?` · `lead?` · `actions?: ReactNode` · `note?: string` · `media?: ReactNode` · `meta?: ReactNode` · `variant?: 'page'\|'detail'` | **h1 을 만드는 유일한 컴포넌트** — 한 페이지에 하나. 100vh 안 쓴다. `media` 는 제목 왼쪽 썸네일(없으면 감싸는 div 도 안 생긴다), `meta` 는 제목 아래 칩 줄, `detail` 은 제목 한 단 작게(긴 케이스 제목용) |
| `Section` | `components/Section.tsx` | `title?` · `eyebrow?` · `lead?` · `children?` · `id?` | 제목은 h2 고정. 바깥 여백을 스스로 주지 않는다 |
| `Panel` | `components/Panel.tsx` | `title?` · `eyebrow?` · `tone?: 'card'\|'banner'\|'alert'` · `titleAs?: 'h2'\|'h3'` · `children?` · `id?` | 흰 섬. `card` radius 16 / `banner` radius 32 + 가운데 정렬 / `alert` 좌측 굵은 선. 제목 기본 h3(배너는 h2) |
| `PubButtonLink` | `components/Button.tsx` | `href` · `children` · `variant?: 'primary'\|'ghost'` · `size?: 'sm'\|'md'\|'lg'` · `external?: boolean` | 내부는 `next/link`, `external` 이면 새 탭 `<a>` |
| `PubButton` | `components/Button.tsx` | `children` · `variant?` · `size?` · `type?: 'submit'\|'button'` · `name?` · `value?` | 폼 제출용. **onClick 을 받지 않는다**(받으면 클라이언트 컴포넌트가 되어 서버 컴포넌트에서 못 쓴다) |
| `Chip` | `components/Chip.tsx` | `children` · `tone?: 'quiet'\|'solid'` · `title?` | 뜻은 글자로 적는다. 색으로만 상태를 말하지 않는다 |
| `Stat` / `StatRow` | `components/Stat.tsx` | `Stat`: `label` · `value: string` · `caption?` / `StatRow`: `children` | `value` 가 문자열인 이유: 집계 실패를 `0` 으로 접지 않는다(§7.1, "집계 불가"를 그대로 넘긴다) |
| `Footer` | `components/Footer.tsx` | `note?: string` | 링크 4개 + 상태 한 줄 |
| `PubProgress` | `components/PubProgress.tsx` | `value: number` · `max: number` · `label: string` | **A3.** 네이티브 `<progress>` — 채운 폭을 인라인 스타일로 주지 않으려고(규칙 3). `label` 을 막대 위에 글자로도 적는다 |
| `PubChoice` | `components/PubChoice.tsx` | `children` · `onClick: () => void` · `eyebrow?` · `disabled?` | **A3. `'use client'`** — 퀴즈 선택지 흰 카드. 진짜 `<button>` 이라 키보드·포커스가 공짜다. onClick 을 받으므로 서버 컴포넌트에서는 못 쓴다(`PubButton` 과 나뉜 이유) |
| `PubArticle` | `components/PubArticle.tsx` | `html: string` | **A3.** `renderMarkdown()` 결과를 받는 긴 글 타이포(h2/h3·인용·목록·표·코드, 폭 `--pub-measure`). 무해화는 `lib/columns/markdown.ts` 가 한다 — 여기서 또 하지 않는다 |
| `PubColumnCard` | `components/PubColumnCard.tsx` | `href` · `title` · `summary` · `readerType` · `date` | **A3.** 칼럼 목록 카드(제목 h3). `.pub-case` 를 재사용하지 않는다 — 그쪽은 A2 가 케이스 카드로 키운다 |

### A2 에서 추가된 것 (라이브러리 4화면)

| 컴포넌트 | 파일 | props | 비고 |
|---|---|---|---|
| `PubCaseCard` | `components/PubCaseCard.tsx` | `study` · `move` · `moveCount: number` · `reason?: string` | §4 카드 스펙: 문제유형·병목 칩 → 제목("문제 → 수") → `transfer_note` 60자 → 메타 줄(브랜드·등급 2축·무브 N·승인일) · 우측 듀오톤 로고. props 는 **행 조각**만 받는다(상세 로더 타입에 묶이지 않게) |
| `PubBrandLogo` / `PubBrandLogoNotice` | `components/PubBrandLogo.tsx` | `study: LogoInput` · `bottleneck?` · `size?: 'md'\|'lg'` | 판정은 `lib/cases/logo.ts logoFor` 재사용(새로 쓰지 않는다). 고지 문구는 같은 파일의 `LOGO_NOTICE`. **인라인 스타일 금지의 유일한 예외** — 듀오톤 hue 두 개를 CSS 변수로 내린다(데이터값) |
| `PubGradeBadge` / `PubGradeLegend` | `components/PubGradeBadge.tsx` | `move` | 등급 2축(인사이트 = `displayGradeLabel` · 사실확인 = `factCheckLabel`)을 **항상 같이** 낸다. 방향 아이콘은 `grade-display.ts` 에 헬퍼가 들어오면 여기 한 곳에 더한다(없는 것을 지어내지 않는다) |
| `PubFacetBar` / `PubFacet` / `PubFacetSep` | `components/PubFacetBar.tsx` | `label` / `href` · `active` · `count?` / — | 필터 칩 **한 벌**. <1024px 상단 가로 스크롤, ≥1024px 좌측 sticky 세로 — 모양은 CSS 가 정한다(두 벌 렌더 금지). 선택은 `aria-current="page"` 로도 말한다 |
| `PubEmpty` | `components/PubEmpty.tsx` | `title` · `description?` · `action?` · `compact?` | **"0건" 전용**이다. 조회 실패는 `Panel tone="alert"` 로 따로 낸다(§7.1) — 둘을 이 컴포넌트로 합치지 마라 |
| `PubTOC` | `components/PubTOC.tsx` | `items: readonly [id, label][]` | 상세 사이드 목차. 부모가 `.pub-detail` 이어야 sticky 규칙이 먹는다. JS 0 |

클래스는 `pub.css` 하단 "A2" 블록에 있다(`.pub-liblayout` · `.pub-cardgrid` · `.pub-card` ·
`.pub-facets` · `.pub-detail` · `.pub-toc` · `.pub-row` · `.pub-tile` · `.pub-field` · `.pub-empty` …).
클라이언트 컴포넌트(저장·피드백·링크복사)는 `PubButton` 을 못 쓴다(onClick) — `.pub-btn` 클래스를
직접 붙인다.

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

## A2 가 어떻게 결정했나 (A3 는 1번을 그대로 따라가면 된다)

1. **헤더 두 개 → (a) 로 풀었다.** `_ds/AppNav` 의 숨김 조건에 `/library` 접두사를 더했다
   (`app/_ds/components/AppNav.tsx` 첫 판정, 한 줄). `PubShell` 에 헤더를 빼는 prop 을 만드는
   (b) 는 **버렸다** — 그렇게 하면 익명 방문자가 라이브러리에서 내부 도구 네비(케이스 검수·
   발행 연결 수리…)만 보게 된다. 대가: 로그인한 내부 검수자가 `/library/*` 에서 사이드바를
   잃는다(대시보드로 돌아가는 링크는 `PubNav` 에 있다). `app/layout.tsx` 는 건드리지 않았다.
2. **`.sa-main` 좌측 여백** — 1번을 (a)로 풀어 같이 없어졌다(사이드바가 렌더되지 않으므로
   `body:has(.sa-sidebar)` 가 안 맞는다).
3. **카드** — `.pub-case`(랜딩 한 줄)를 `.pub-card` 로 키웠고 `PubCaseCard` 가 그 스펙이다.
   로고는 `lib/cases/logo.ts` 판정을 그대로 쓴다. `logo_url` 컬럼이 **없는 환경**(마이그
   20260930000001 미적용)에서는 `logo_columns === 'missing'` 안내 한 줄을 화면에 남긴다 —
   "로고 미기재"가 아니라 "컬럼 없음"이라고 적는 자리다.
4. **데이터 로더는 이미 있다.** `lib/cases/library.ts`(그리드) · `lib/cases/detail.ts`(상세) ·
   `lib/cases/saves.ts`(저장함) · `lib/cases/grade-display.ts`(등급 라벨) · `lib/methodology/content.ts`
   (방법론 본문). A2 는 화면만 갈았고 이 다섯 파일을 손대지 않았다.
5. **`/library/saved` 는 스스로 로그인 판정을 한다**(정책 접두사가 proxy 를 통과시킨다).
   이관 후에도 `getAuthVerdict()` → `/login` redirect 가 파일 첫 줄에 그대로 있다.
6. **`_ds` 쪽은 아무것도 지우지 않았다.** `_ds/CaseCard` · `_ds/BrandLogo` · `styles.css` 의
   `.sa-lib*` 는 남아 있다(다른 화면 회귀 격리). 참조만 끊었다 — `grep -rn "_ds/" app/library`
   가 0줄이다.

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
5. **A2 와 만난 자리 3곳** — `AppNav`(숨김 두 줄이 나란히 있다) · `pub.css`(A3 블록 뒤에 A2
   블록) · 이 문서(표 두 개). 세 곳 모두 양쪽을 다 살렸고, 서로 덮는 선택자는 없다
   (`.pub-hero-title` 만 겹치는데 각자 `.pub-quiz` · `.pub-hero--detail` 스코프다).
