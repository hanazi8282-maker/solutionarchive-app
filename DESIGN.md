# DESIGN.md — SolutionArchive 디자인 정본

남헌 2026-09-29 승인(목업 `public-case-detail` · `operator-grading` + 토큰 초안). 이 파일 하나가 정본이다.
구현은 `app/_ds/tokens/sa.css` — 값을 적는 유일한 자리. 나머지 레이어(`_ds` 별칭 · `.sa-lib` · `.sa-v2` · `.pub-root`)는
이름을 유지하고 값은 `--sa-*` 를 가리킨다. `scripts/design-tokens-selftest.mjs` 가 CI 에서 (1) 화면 파일에 리터럴 색·반경이
없는지, (2) 이 문서와 sa.css 의 토큰 이름이 같은지 센다. 토큰을 더하거나 빼면 두 곳을 같이 고친다.

## 1. 원칙

- 한 벌 + 밀도 프리셋 2개. 공개(아카이브)와 운영(작업대)은 같은 토큰을 읽고 `[data-density="operate"]`(= `.sa-v2`)에서
  본문 크기·행간·카드 패딩·컨트롤 높이만 바뀐다.
- 서체는 둘: 영문·숫자 Inter, 한글 Pretendard(글리프 단위 폴백). 둘 다 next/font 셀프호스팅(`app/layout.tsx`), 런타임 CDN 없음.
- 액센트는 파랑 하나. 판정 3색(긍정·부정·혼합)은 선·아이콘·점에만 쓰고 글자는 잉크다.
- 판정문(A) 요소는 카드·헤더의 2축 등급 스탬프(`.stamp`, 이중선) 하나뿐. 그 밖은 아카이브(C): 12칸 편집 격자, 넓은 여백, 색인 줄.
- 반경은 넷(컨트롤 10 · 카드 16 · 배너 24 · 알약 100). 그림자는 카드 rest 하나, 호버는 테두리를 진하게(뜨지 않는다).
- 포커스는 outline 2px 하나. 박스섀도 링 없음. `outline: none` 금지.
- 모션은 transform·opacity 만. `transition: all` 금지. hover 는 색만 150ms, press 는 scale(.98) 120ms, 키보드 액션은 0ms(`html[data-kbd]`).
  reduced-motion 은 이동만 끈다(색·투명 전환은 남긴다).
- 숫자는 전부 tabular-nums. 아이콘은 전부 인라인 SVG(유니코드·이모지 아이콘 금지), 장식 아이콘은 `aria-hidden`.

## 2. 토큰 (`app/_ds/tokens/sa.css`)

### 서체
- `--sa-font` Inter, Pretendard, -apple-system, sans-serif (앱은 `var(--font-inter), var(--font-pretendard)`)
- `--sa-font-mono` ui-monospace, "SF Mono", "Cascadia Mono", monospace

### 타입 스케일 (px 고정, 9단 + 디스플레이)
- `--sa-size-12` 12 배지 안에서만
- `--sa-size-13` 13 캡션 최소
- `--sa-size-14` 14 운영 보조·표
- `--sa-size-15` 15 운영 본문
- `--sa-size-17` 17 공개 리드
- `--sa-size-20` 20 소제목
- `--sa-size-24` 24 섹션 제목
- `--sa-size-28` 28 페이지 제목(운영) · 스탬프 글자
- `--sa-size-36` 36 페이지 제목(공개)
- `--sa-size-44` 44 공개 디스플레이 전용
- `--sa-leading-body` 1.55 (운영) · `--sa-leading-body-pub` 1.65 (공개) · `--sa-leading-head` 1.2
- `--sa-tracking-head` -0.015em · `--sa-tracking-display` -0.02em
- `--sa-weight-text` 400 · `--sa-weight-strong` 600 · `--sa-weight-head` 600

### 색
- `--sa-canvas` #fbfbfd 캔버스
- `--sa-surface` #ffffff 카드·패널
- `--sa-surface-2` #f3f4f8 두 번째 면(인셋·헤더 띠)
- `--sa-line` #e2e8f0 선
- `--sa-line-strong` #cbd2dc 호버 테두리
- `--sa-ink` #0f172a 글자·제목(본문도 잉크)
- `--sa-ink-hover` #1e293b 잉크 버튼 hover 만
- `--sa-muted` #5b6874 보조 글자(캔버스 위 6.4:1)
- `--sa-faint` #a3adb8 장식·비활성 전용. 본문·캡션 금지
- `--sa-accent` #1d4ed8 유일한 액센트 · `--sa-accent-ink` #ffffff · `--sa-accent-hover` #1a44be · `--sa-focus` #1d4ed8
- `--sa-verdict-pos` #396c00 · `--sa-verdict-neg` #b8452a · `--sa-verdict-mix` #8f6400 — 선·아이콘·점에만(흰 바탕 3:1 이상)
- `--sa-verdict-pos-bg` #e9ffd2 · `--sa-verdict-neg-bg` #fff1ec · `--sa-verdict-mix-bg` #fff7e0 — 기존 배지의 연한 바탕. 새 화면은 쓰지 않는다
- 다크 면(공개 전용, 랜딩 배너·CTA 배너): `--sa-dark-canvas` #020308 · `--sa-dark-ink` #fafafa · `--sa-dark-muted` rgba(250,250,250,.62) ·
  `--sa-dark-line` rgba(250,250,250,.14) · `--sa-dark-focus` #5dbce5

### 반경 · 그림자 · 포커스
- `--sa-round-control` 10px · `--sa-round-card` 16px · `--sa-round-banner` 24px · `--sa-round-pill` 100px
- `--sa-lift-rest` 0 2px 8px rgba(0,0,0,.04) 카드 rest · `--sa-lift-float` 0 8px 24px rgba(15,23,42,.10) 토스트 등 떠 있는 것만
- `--sa-focus-outline` 2px solid var(--sa-focus) · `--sa-focus-offset` 2px

### 모션
- `--sa-ease` cubic-bezier(0.19, 1, 0.22, 1)
- `--sa-motion-press` 120ms · `--sa-motion-color` 150ms · `--sa-motion-move` 220ms · `--sa-motion-toast` 200ms

### 간격 · 높이 · 폭
- `--sa-gap-1` 4 · `--sa-gap-2` 8 · `--sa-gap-3` 12 · `--sa-gap-4` 16 · `--sa-gap-5` 20 · `--sa-gap-6` 24 · `--sa-gap-8` 32 · `--sa-gap-10` 40 · `--sa-gap-16` 64
- `--sa-h-sm` 32 · `--sa-h-md` 36 (작업대 기본) · `--sa-h-lg` 44 (터치 최소치, 공개 기본)
- `--sa-measure` 68ch 본문 한 줄 · `--sa-frame` 1120px 공개 프레임 · `--sa-sidebar` 232px 운영 사이드바

### 밀도 프리셋
- 기본(공개): `--sa-size-body` 16px · `--sa-leading` = body-pub · `--sa-pad-card` 24px · `--sa-h-control` = h-lg
- `[data-density="operate"]`, `.sa-v2`: 본문 15px · 행간 1.55 · 카드 패딩 16px · 컨트롤 36px (남헌: 15px 유지, 실사용 뒤 재확인)

### 옛 이름 매핑 (별칭 파일이 하는 일)
- `_ds` `--text-*`/`--surface-*`/`--border*`/`--primary*`/`--radius-*`/`--shadow-*`/`--fs-*` → `app/_ds/tokens/{colors,typography,spacing}.css`
- `.sa-lib` → `app/_ds/tokens/app-light.css` · `.sa-v2` `--v2-*` → `app/_ds/v2/v2.css` · `.pub-root` `--pub-*` → `app/_pub/tokens.css`
- 타입 매핑: pub display 48→44, display-sm 40→36, head-sm 22→24 · v2 h2 22→20 · 카드 반경 20→16 · 썸네일 12/8→10 · 컨트롤 md 40→36 · 본문 폭 720px→68ch

## 3. 컴포넌트

공개(`app/_pub/components`, `.pub-*`): PubShell · PubNav · Hero(페이지의 유일한 h1) · Section · Panel(card/banner/alert) · PubButton/Link ·
Chip · Stat · Footer · PubProgress · PubChoice · PubArticle · PubColumnCard · PubCaseCard · PubBrandLogo · PubGradeBadge/Legend ·
PubFacetBar · PubEmpty · PubTOC · PubSignalCard. API 는 `app/_pub/README.md`.

운영(`app/_ds/components`, `.dgy-*`/`.v2-*`): AppNav · Shell/PageHeader/StatTile · Card · Badge · Button · Field/Choice · FilterChip ·
FacetSelects · ProgressBar · EmptyState · EvidenceCaption · GradeLegend · BrandLogo/LogoImg · CaseCard. 클래스는 `app/_ds/v2/v2.css`.

목업에서 오는 것(페이즈 2): `.stamp` 2축 등급 스탬프(1.5px 잉크 테두리 + 3px 오프셋 외곽선, 글자 밑 판정색 선) · 색인 줄(라이브러리 목록,
카드 격자 대신) · sticky 툴바 + `<kbd>` · 44px 라디오 타일 · 저장 5초 되돌리기 토스트 · SVG 심볼 시트.

## 4. 화면 규칙

- 공개 케이스 상세: 브랜드명이 H1, 요약 문장은 데크(데이터 변경 없이 렌더만). 12칸 격자(왼쪽 3칸 섹션 제목, 오른쪽 9칸 본문).
- 라이브러리 목록: 색인 줄(소형 스탬프). 3열 동일 카드 격자를 쓰지 않는다.
- 랜딩: 라이트 + 다크 배너 하나. 다크 면은 배너뿐이다.
- 운영 채점(`/relevance/grade`): sticky 툴바(진행 n/m, 단축키), 원문·번역 2열(≥1024), 44px 라디오 타일.
  키 1/2/3 판정 · 4/5 · Enter 저장 · J/K 다음/이전 · U 되돌리기 · 메모 Ctrl+Enter. 저장 → 카드 접힘 → 다음 카드 포커스 → 5초 되돌리기.
- 접근성: 아이콘 버튼 `aria-label`, 스탬프 `role="img" aria-label`, 스킵 링크, `theme-color` 메타, 폼 label·autocomplete·`spellcheck=false`,
  입력 16px(≤760, iOS 줌 방지), `touch-action: manipulation`, 100dvh, 파괴적 액션은 undo 창.

## 5. 카피 규칙

- 정직 3상태. 확인 실패를 정상으로 접지 않는다: 준비 중 / 미저장 / 확인 불가 를 글자로 구분한다(§7.1). 결측은 한 낱말 "확인 불가".
- 사람 문장 먼저. 컬럼·마이그레이션 번호·키(`000031`, `relevance_feedback_notes`)는 `.mono` 캡션으로 뒤에 붙인다.
- 공개 카피에 em 대시(—)·en 대시(–) 없음. 쉼표·마침표로 푼다. 곡선 따옴표, `…`.
- 눈썹 라벨(eyebrow) 없음. 섹션 번호·그라데이션 글자·굵은 좌측 색띠·장식 점·스크롤 큐·버전 라벨 없음.
- 뜻은 글자로도 적는다. 색으로만 상태를 말하지 않는다. 배지의 등급은 항상 2축(인사이트·사실확인) 같이.
- 근거 캡션 유지. 수치에는 출처가 붙는다(`_principles.md §4`).

## 6. 게이트

- UI 변경 PR: `CLAUDE.md §7.3` — web-design-guidelines(파일 목록·위반 수·일시를 PR 본문에), impeccable detect 0건,
  before/after 375·1280 스크린샷(before 는 머지 전에), `node scripts/design-tokens-selftest.mjs`(+ `--mutate`).
- 기준선(Impeccable critique): 운영 16/40 · 공개 22/36. 페이즈마다 재채점해 숫자를 보고한다.
