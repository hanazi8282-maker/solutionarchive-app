# UI 전면 개선 설계 (2026-09-21, architect 산출물)

근거: `docs/ui-competitor-patterns-2026-09-21.md`(경쟁 7곳 공통 패턴 P1~P11). 남헌 지시: 공통 패턴 먼저, 좋은 요소는 세션 판단으로 우선 적용, 문제는 나중에 삭제. **DB·API 무변경**(마이그 0, `lib/**`·`app/api/**` diff 0). 머지는 남헌.

## A. 설계 요약

### A-0. 데이터가 없어 못 하는 것 (실측 `analysis_aspects` 27컬럼)
| 제안 | 가능? | 근거 |
|---|---|---|
| 언급 수 / 전체 대비 % | ❌ | mention_count 류 컬럼 없음 |
| 감성 분해 미니바 | ❌ | sentiment 컬럼 없음(importance/satisfaction 0~10 뿐) |
| 추이(trendline) | ❌ | 시계열 스냅샷 없음 |
| 행 클릭 → 원문 리뷰 목록 | ⚠️ 반만 | `evidence_quotes` 40행 중 5행만 채워짐, `analysis_inputs` GET 라우트 없음(POST 전용) → 범위 밖 |
| 별점 분포 | ❌ | 별점 컬럼 없음 |

없는 칸을 0이나 빈 막대로 그리지 않는다(§7.1). 있는 값(기회점수·중요도·만족도·판정·인용 수·확인 여부)으로 P2 "순위 테이블" **형식만** 가져온다.

### A-1. 공통 셸 — 1024px 분기, 하단 탭바 없음
- **≥1024px 좌측 고정 사이드바 236px.** 기존 토큰 `--sidebar-w`·`--sidebar-*` 6개가 원래 사이드바용 → 제 용도로 복귀. 새 색 토큰 0.
- **<1024px 현 상단바 유지**(375px 가로 스크롤 없음 실측 완료).
- 하단 탭바 안 만듦: review 의 sticky 저장바(`bottom:12px`)와 충돌 + 모바일 사용 근거 없음. 남헌이 폰에서 승인 누르기 시작하면 `--tabbar-h` 와 함께.
- 그룹: `분석`(소구점 분석 /analyze · 발굴 후보 검증 /discovery) / `검수·운영`(케이스 /cases · 칼럼·스레드 /columns · **발행 연결 수리** /dashboard(이름 교체) · 에이전트 /agents) / 하단 고정(내 프로필 · 설명서↗ · 이메일+로그아웃). 그룹 라벨 `.dgy-caps` 재사용.

### A-2. 페이지 헤더 패턴
```
[제목]                                   [액션 1~2]
[질문형 부제 한 줄]
[기준 캡션 — 무엇을 몇 건 중에서 셌는지]
────────────────────────────────────────
[필터 칩 행]  ← 목록·검수 화면만, sticky
```
`Shell.tsx` `PageHeader` 에 `meta?: ReactNode`·`filters?: ReactNode` 슬롯만 추가(기존 14개 호출부 무변경).

### A-3. 토큰 — colors.css 안에서만
1. 브랜드 강조색 파랑→보라: `--brand/--brand-hover/--brand-fg`(violet-600/700/#fff) 추가, `--primary: var(--brand)`. Button 은 `--primary` 를 읽어 코드 0줄로 전 CTA 교체. 감성 색(P5)과 브랜드 색 분리.
2. 감성/판정 알리아스 4개: `--sent-pos`(emerald-500) `--sent-neg`(red-500) `--sent-neutral`(slate-500) `--sent-mixed`(blue-500).
3. **미정의 토큰 `--fs-md` 정의(현재 버그)** — result 화면 3곳이 쓰는데 typography.css 에 없다 → `--fs-md: 15px`.
4. 죽은 타사 도메인 토큰 삭제: `--task-*` 6개 · `--role-*` 3개(소비처 0). 파일 헤더 "Dothegy Works" 주석 교체.
유지: slate 램프, spacing/radius/shadow, Pretendard+JetBrains Mono, `--sidebar-*`, status 4종(-700 대비 보정), dark 블록.
⚠️ `app/api/onboarding/quiz/share/route.tsx`(OG 이미지)는 CSS 변수를 못 읽는다 — 하드코딩 색이 있으면 PR1 에서 같이 바꾼다.

### A-4. 공용 컴포넌트 — 신규 2개
| 컴포넌트 | props | 소비처 |
|---|---|---|
| `FilterChip` | `{ href; active; count?; children }` — analyze/discovery/cases 의 복붙 칩 통합 | analyze · discovery · cases · columns |
| `EvidenceCaption` | `{ n: number\|null; total: number\|null; period?; source?; method }` — `n==null` "확인 불가" / `n===0` "검증된 인용 없음", 절대 같은 문장으로 내지 않음 | result · review · remedy · cases |
| `PageHeader` 확장 | `+meta?`, `+filters?` | 전 화면 |
| `AppNav` 재작성 | 시그니처 불변 `{ email }` | layout |
안 만듦: StatCard(=`StatTile/StatGrid` 이미 있음), RankedTable/DetailPanel(소비처 review 한 곳 → 인라인), Sidebar 분리(AppNav 안에서 LINKS 공유).

## B. 화면별 변경안

### B-1 `/analyze/[id]/result` [상세]
- 첫 뷰포트: 히어로 — 사분면 배지(또는 "사분면 없음") · 한 줄 결론 · 수요축/선례축 숫자 · 기준 캡션 "소구점 M개 · 원문 N건 기준, 마지막 진단 YYYY-MM-DD KST". 카드 1·4 병합, 2×2 미니 사분면(빈 셀 = "이쪽이 비어 있다 = 다음에 채울 여지").
- `PmfRunCard` 를 맨 아래로(진단 있으면 히어로 우상단 "다시 진단" 버튼; 패싯 비면 위로).
- 섹션 제목 질문형: "이 시장은 어디까지 왔나" / "무엇이 가장 아픈가" / "무엇을 먼저 고칠까" / "남들은 어떻게 풀었나" / "다음 행동" 유지.
- 숫자 링크: 기회점수·속성 → `/analyze/{id}/review#aspect-{id}`, 퍼센타일 → `/analyze?sort=demand`.
- 인용 `EvidenceCaption`. 우상단 액션: 검수로 → + 요약 복사.
- 유지: `PMF_QUADRANT_ADVICE`/`noQuadrantAdvice`/`aspectVerdict().reading`/`opportunityBreakdown().reading`/퍼센타일 30건 하한/`DRAFT_NOTICE`/3상태 분기 — **한 글자도 새로 쓰지 않는다.**

### B-2 `/analyze` [상세]
- 헤더 → 발굴 배너 → `StatGrid` 4타일(전체/검수 대기/원문 있음·분석 전/오래 멈춤, 기존 `counts`·`readyN`·`funnelStats` 재사용, 새 쿼리 0) → "오늘 볼 것" → 필터 칩 sticky → 목록.
- 행 4열 밴드: 상품 / 원문 N건 / 수요·선례·사분면 / 상태·경과.
- `FilterLink`→`FilterChip`. URL 입력창(Kimola)은 기각(자체 판단: 마법사 입구 이중화).
- 유지: `demandAxis` 재계산 금지, 3상태 문장, LIMIT 경고.

### B-3 `/analyze/[id]/review` [상세, 🔴]
- 헤더 캡션 "원문 N건 · 소구점 M개 · 확인 K/M" → 순위 테이블(소구점/기회점수/중요도/만족도/판정/인용/확인, 기회점수 내림차순) → 행 선택 → 우측 상세 패널(기존 편집 폼 통째 이동, **`patchAspect`/`save`/폴링 0줄 변경**).
- 인용 열: `undefined` → `—`, `[]` → `0`(다르게).
- 물음표 툴팁 = `aspectVerdict().reading`·`opportunityBreakdown().reading`. `ProgressBar` 헤더 meta. sticky 저장바 유지.
- 375px: 테이블 자체 가로 스크롤, 패널은 아래로, 페이지 가로 스크롤 0.

### B-4 remedy 카드 [상세]
- 유형 색: 보완 사례=보라(`--brand`), 막힌 사례=빨강(`--sent-neg`), 원칙=회색(`--sent-neutral`). **초록 금지**.
- "이 권고의 근거" `<details className="dgy-details">` 안에 매칭 낱말 + low_confidence/is_estimate 설명.
- 정렬 토글 `영향 큰 순`(서버 순서) ↔ `근거 등급 순`(자체 판단).
- `no_match` "관련 사례 없음 — 억지로 끼워 맞추지 않는다." / `not_run` "확인 불가 — {reason}" **서로 다른 문장 유지**.
- **`fixLine`/`failureLine`/`principleLine` 반환 문자열을 화면에서 가공하지 않는다**(자르기·재조립 금지).

### B-5 나머지
- `/analyze/new`: 단계 진행 표시 + 3단계 "이 분석이 답하는 질문" 3줄 + 프리필 출처. URL 검증·슬라이더·비용 분해 기각.
- `/angles`: 헤더 배지 → `StatGrid` 3칸, 질문형 제목. 공유 링크/PDF 범위 밖(인증 경계).
- `/cases`: 요약 타일 3(승인 대기 무브/검수 대기 케이스/이식성 미판정 — 컬럼 없으면 `확인 불가`) + 필터 칩 + 카드 유지(테이블 전환 안 함) + `EvidenceCaption` + 무브/케이스 결정 영역 구분선.
- `/columns`: 대기/승인/반려 탭(`FilterChip`).
- `/discovery`: StatGrid 유지, 행에 "hits N / 기준 M" 병기, 뒤집힌 판정 회색, 확인 불가 배너 유지. 3열 트렌드 기각.
- `/dashboard`: 이름 "발행 연결 수리"(AppNav·metadata·PageHeader), 4번째 타일 추가 안 함, 원인 유형 라벨.
- `/agents`: 단계 목록 `<details>` "작업 흔적", 문구 전부 유지.
- `/settings/profile`: 필드별 프리필 설명 + 저장 후 "새 분석 시작".
- `/onboarding/quiz`·`/login`: 브랜드 색만, 결과 카드 `StatTile`.
- 빈 상태: `EmptyState` 3종(데이터 없음/진행 중/오류·확인 불가), "0건"과 "확인 불가" 다른 variant.

## C. 구현 순서 (PR 7개, 각 ≤500줄, 앞이 뒤의 전제)
1. **PR1 셸+토큰**: colors.css · typography.css · styles.css · AppNav.tsx · layout.tsx · Shell.tsx(PageHeader 슬롯) · FilterChip.tsx · EvidenceCaption.tsx (+ quiz share OG 색)
2. **PR2 결과+remedy**: result/page.tsx · remedy-section.tsx · pmf-run-card.tsx · wtp-card.tsx · advisor-cards.tsx(배지 톤)
3. **PR3 목록**: analyze/page.tsx · dismiss-banner.tsx
4. **PR4 검수**: review/page.tsx · review/pmf-panel.tsx
5. **PR5 케이스·칼럼**: cases/page.tsx · decision-form.tsx · columns/page.tsx · decision-form.tsx · pattern-form.tsx
6. **PR6 발굴·수리·에이전트**: discovery/page.tsx · review-form.tsx · dashboard/page.tsx · agents/page.tsx
7. **PR7 입구**: analyze/new · angles · settings/profile · login · onboarding/quiz
손대지 않는 파일: `lib/**` 전부 · `app/api/**` · `supabase/migrations/**`.

## D. 수용기준(AC) — 요지
- PR1: 1280px 사이드바 236px + 그룹 라벨 2개 · 본문 left ≥ 236 · 375px 사이드바 없음·전 라우트 `scrollWidth === clientWidth` · /login·/onboarding 셸 없음 · `--fs-md` 15px 이고 결론 문단 15px · primary 버튼 `rgb(124,58,237)` 이고 info 배지와 다름 · `--task-`/`--role-` 0건 · tsc/lint 0.
- PR2: 첫 뷰포트(1280×800)에 사분면·결론·수요·선례·캡션 5개 · 진단 있으면 PmfRunCard 폼 첫 뷰포트에 없음(패싯 비면 있음) · 섹션 제목 물음표 · 기회점수 `<a href*="/review#aspect-">` · not_run/no_match 문구 다름 · 매칭 근거 `<details>` · 셀프테스트 6종 통과 · `git diff --stat lib/ app/api/` 빈 출력.
- PR3: 타일 4개+caption · 타일 합 = 필터 칩 건수 · LIMIT 경고 일치 · 확인 불가/속성 없음/미진단 문구 다름 · sort=demand 에서 값 없는 행이 뒤 · 칩 행 sticky·375px 칩 내부 스크롤 · FilterChip 단일 정의 · analyze-list-signals-selftest 통과.
- PR4: 첫 뷰포트에 모든 속성 이름 · 기회점수 내림차순 · 행 클릭→패널 편집→저장→서버 opportunity_score 로 행 갱신 · 인용 열 `—`/`0` 구분 · 375px 테이블 내부 스크롤·패널 아래·페이지 가로 0 · sticky 저장바 · 미확인 경고 문구 유지 · 폴링 상한 문구 유지.
- PR5: 타일 3(이식성 미적용 시 `확인 불가`) · 마이그 배너 2종·locked 비활성 · 무브/케이스 결정 구분 · columns 탭 합계 · PGRST205 배너 · EvidenceCaption 0건≠실패 · case-review-rules·case-pipeline 셀프테스트.
- PR6: "발행 기록" 0건 · hits N/기준 M · 확인 불가≠기각 · 뒤집힌 행 회색 · agents details · 문구 유지 · agents-status·discovery 셀프테스트.
- PR7: new 단계 표시+질문 3줄·폼 name/검증 문구 불변 · angles 3숫자+Notice · profile 프리필 설명+새 분석 링크 · login 4분기 문구 · quiz 익명 200 · 셀프테스트 3종.

## E. 리스크
전체 🟡. PR1 🟡(전 화면 offset 한 곳) · PR2 🟡(문장 템플릿 회귀 — lib 무변경 diff 로 증명) · PR3 🟢 · **PR4 🔴**(편집 폼 이동 중 `patchAspect`/`save`/폴링 훼손 시 사람 검수값 손실 — 컨테이너만 이동, diff 로 증명) · PR5 🟡(`locked` 분기) · PR6·7 🟢.
회귀 3곳: ① 셀프테스트가 문장을 고정하는 lib 함수 — 화면 가공 금지 ② §7.1 3상태 문구를 공통 폴백 `—` 로 뭉개지 말 것 ③ 로그인 벽 — 익명으로 볼 수 있는 화면은 /login·/onboarding/quiz 뿐, Playwright 미설치.
별건(남헌 확인): MCP advisory 가 `seller_profiles`·`wtp_signals` RLS 비활성을 critical 로 보고 — 이 작업과 무관, 미적용.

## F. 검증 4겹
1. 기계: tsc · lint · build · 관련 셀프테스트(전 PR 필수).
2. 로컬 dev + 사용자 Chrome 로그인(픽셀 검증 정본) — 화면당 30초 체크 순서. 375px 은 DevTools Device Toolbar.
3. 같은 오리진 iframe 375px 로 경로 배열 돌려 `scrollWidth===clientWidth` 자동 확인(Playwright 미설치).
4. Vercel preview 익명: /login 4분기 · /onboarding/quiz · 보호 경로 307. **보호 화면 익명 200 은 인증 회귀.**
보고 규칙: 못 본 화면은 "정상"이 아니라 "미확인".
