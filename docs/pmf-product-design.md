# PMF 제품화 설계 — 근거 수집을 셀러가 쓰는 화면으로 (2026-09-20)

남헌 지시(2026-09-20 PART C): 리뷰 수집·앵글 생성·기회점수 산출은 매일 돌지만, **로그인한 셀러가 자기 프로젝트를 넣고
결과를 보고 바로 실행에 옮길 수 있는 UI/UX** 가 없다. 원칙: 모순되거나 기술적으로 불가능한 것을 빼고는 **일단 전부 구현**,
그다음 걷어낸다. 리서치 정본은 `reports/2026-09-20/pmf-product-research.md`(차용 18 · 기각 12), 09-19 `ui-reference-notes.md`.

## 0. 세 가지 필수 산출물 (남헌 지정)

| # | 무엇 | 지금 | 목표 |
|---|---|---|---|
| A | **PMF 진단 결과 화면** — Stage 2 시장성숙도 + Stage 3 기회점수 | 검수 화면 안에 성숙도 숫자·속성 카드·PMF 패널이 흩어져 있고, 선례축은 CLI(`pmf-assess.mjs`)로만 생긴다 | `/analyze/[id]/result` 한 장의 **진단 보고서** + 앱 안에서 진단 실행 |
| B | **크로스섹션 어드바이저 UI** — `strategy_principles` 32행·선례·실패 사례 | `advisor-cards.tsx` 가 "유사 사례 보기" 버튼 하나로 세 코퍼스를 뭉쳐 부른다 | 결과 화면에 상시 노출 + 질문 3개 버튼 + MatchWhy 통일 |
| C | **비슷한 사례 기반 문제 해결 제안** — `failed_angles` 활용 자동 추천 | 없음(실패 사례는 어드바이저 코퍼스 B 로 나열만) | 속성(페인)마다 "이런 문제엔 이렇게 보완한 사례 / 이렇게 갔다가 망한 사례" 를 자동 조립 |

## 1. 스키마 (적용 완료 2026-09-20, `20260923000001_pmf_product_facets.sql`)

- `analysis_projects` + `market, bottleneck, business_model, buyer_type, price_band, purchase_frequency`(전부 NULL 허용, CHECK 어휘 = `lib/cases/draft.ts`)
- `analysis_aspects` + `evidence_quotes jsonb NOT NULL DEFAULT '[]'` — `[{ text, source_type }]`
- `seller_profiles(owner_email UNIQUE, pitch, market, 패싯 5)` — 로그인 이메일당 1행

## 2. 데이터 흐름

```
/analyze/new  ──(프로필 프리필)──▶ analysis_projects(+패싯)
   │  2단계: 원문 붙여넣기  또는  다나와 URL 등록(/api/analyze/targets → 야간 수집)
   ▼
extract (lib/analysis/extract-run.ts) ──▶ analysis_aspects(+evidence_quotes) · maturity_stage
   ▼
POST /api/analyze/pmf {project_id} ──▶ matchMoves(bottleneck, 패싯) + demandAxis + precedentAxis + quadrantOf
                                      ──▶ pmf_assessments(+pmf_assessment_moves) INSERT   ← CLI 와 같은 산식·같은 저장
   ▼
GET /api/analyze/remedy?project_id ──▶ 페인 속성별 { 보완 선례(case_moves) · 실패 사례(failed_angles) · 원칙(SP) } 조립
   ▼
/analyze/[id]/result  (보고서)  ──▶ 요약 마크다운 복사 · 앵글로 이동 · 다음 미확인 속성
```

## 3. 화면별 명세

### 3-1. `/analyze/[id]/result` — 진단 결과 (신규, 산출물 A·B·C 의 집)
읽기 전용 서버 컴포넌트 + 클라이언트 액션 몇 개. 섹션 순서는 "결론 → 근거 → 행동".
1. **한 줄 결론** — 사분면 배지 + **처방 문장**(`PMF_QUADRANT_ADVICE`, `lib/cases/match.ts` 에 추가). 4개 고정:
   - PROVEN_DEMAND: "수요도 있고 선례도 있다. 선례 무브를 그대로 옮겨 붙이는 게 가장 싸다."
   - UNCHARTED_DEMAND: "수요는 있는데 남이 푼 적이 없다. 우리가 1번이다 — 실패 사례부터 확인하고 작게 검증해라."
   - CROWDED_NO_DEMAND: "남들은 많이 했는데 우리 리뷰엔 근거가 없다. 리뷰를 더 모으거나 소구점을 바꿔라."
   - PARK: "둘 다 약하다. 지금은 건드리지 않는다."
   - 사분면 없음(축 하나 확인 불가): 어느 축이 비었는지와 **채우는 방법**(진단 실행 / 원문 추가)을 그 자리에.
   - 문장 끝에 항상 "권고이지 보장이 아니다" 톤 1줄(Mirr "초안과 납품은 다르다").
2. **진단 실행 카드** — 프로젝트 패싯이 비어 있으면 인라인 폼(병목·사업모델·구매자·가격대·구매빈도·시장)을 여기서 받아
   `PATCH /api/analyze/projects` 로 저장 후 `POST /api/analyze/pmf`. 이미 있으면 "다시 진단" 버튼 + 마지막 진단 시각.
3. **시장 성숙도** — 1~5 숫자 + 단계 이름 + `maturity_notes` + 단계별 고정 해설·행동 1줄(`MATURITY_STAGES` 상수 신설,
   `lib/analysis/types.ts`). `m_meta_signal` 이면 "소비자가 카테고리 전체를 비교하고 있다" 배지.
4. **두 축** — 수요축·선례축 **따로**(합치지 않는다). 선례축 아래 MatchWhy 형식: 겹친 병목어 · 제외 사유
   (`excluded.self/not_approved/grade_d` — `matchMoves` 가 이미 돌려주는데 화면이 버리고 있었다) · 무브 수.
   수요축 아래 **우리 DB 퍼센타일**(다른 프로젝트 대비). 표본 30 미만이면 "표본 N건이라 퍼센타일을 내지 않는다" — 퀴즈 규칙 재사용.
5. **상위 소구점 3** — 카드마다: 이름 · **기회점수 분해**(`중요도 I · 만족도 S · 격차 max(I−S,0)` 세 조각 + 한 줄 읽기)
   · **판정 동사 1개**(`aspectVerdict()` 신설: I≥6∧S≤4 "여기를 민다" / I≥6∧S≥6 "기본기 — 안 밀어도 된다" / I<6 "버린다" / 그 밖 "지켜본다")
   · **원문 인용** `evidence_quotes` 1~2문장(없으면 "인용 없음 — 재분석하면 채워진다") · 사람 확인 여부.
   두 축 원칙: 판정 동사는 (I, S) 만으로 낸다. 선례와 섞지 않는다.
6. **문제 해결 제안** (산출물 C) — `GET /api/analyze/remedy` 결과. 페인 속성(판정 "여기를 민다")마다 카드 1장:
   - 헤드라인: "'{속성}' 문제 — 비슷한 문제를 이렇게 보완한 사례가 있다"
   - **보완 선례** ≤3: `{brand}` 가 `{lever}` 로 "{claim}" (사실확인 {fact_check_grade} · 인사이트 {evidence_grade} · {direction})
   - **이렇게 갔다가 막힌 사례** ≤2: `{claimed_angle}` → {outcome} ({source_tier}{is_estimate ? ' · 추정 포함' : ''})
   - **원칙** ≤2: `SP-NNN` {statement} (등급)
   - 각 줄에 `MatchWhy`(겹친 낱말 · 점수 · 신뢰도 낮음 배지). 0건이면 "관련 사례 없음 — 억지로 끼워 맞추지 않는다"(3상태 유지).
   - 하단 링크: "이 속성으로 앵글 만들기 → /analyze/[id]/angles#aspect-{id}"
7. **어드바이저 3버튼** (산출물 B) — "남들은 어떻게 풀었나(선례)" / "이 소구점으로 망한 적 있나(실패 사례)" /
   "원칙은 뭐라고 하나(원칙 32행)". 같은 `AdvisorLoader`, `focus=a|b|c` 로 한 코퍼스만 펼친다.
8. **행동** — 상단 우측 액션: **요약 마크다운 복사**(`GET /api/analyze/summary?project_id` → 클립보드) · 검수로 · 앵글로.
   앵글 진입 전 고정 1줄: "여기까지가 초안이다. 상세페이지 문구는 사실 확인·표시광고 검토·자사 톤 조정을 거쳐야 하고 이 도구는 그걸 하지 않는다."
9. 빈 상태 — 속성 0개: 상태별 문장(수집 중/분석 전/실패) + 그 자리에서 할 수 있는 버튼 1개(분석 시작 = 검수 화면의 `startExtract` 재사용, 링크로).

### 3-2. 기존 화면 손보기
- `/analyze/[id]/review` — 속성 카드에 점수 분해·판정 동사·원문 인용·"다음 미확인 속성 ↓" 앵커. 헤더에 "진단 결과 보기 →" 버튼.
  "분석 시작" 옆 소요시간: `GET /api/analyze/extract?stats=1` 이 준 **실측 중앙값**("원문 N건 기준 보통 M초 · 표본 K건"), 표본 5건 미만이면 "측정 전".
- `pmf-panel.tsx` — 처방 문장 · excluded 표시 · 퍼센타일. 산식 재계산 금지(표시만).
- `/analyze/[id]/angles` — 상단 "초안과 실행은 다르다" 1줄. 그룹 헤더에 판정 동사 어휘 통일.
- `advisor-cards.tsx` — `AdvisorLoader` 에 `focus` prop, 버튼 3개.
- `/onboarding/quiz` 결과 — 풀폭 CTA "이제 내 상품으로 해보기 → /analyze/new", 보조 링크 "먼저 남의 사례 구경하기 → /cases".
- `/analyze` 목록 — ① 빈 상태에 `/cases` 2차 버튼 ② 상단 한 줄 배너 "어젯밤 발굴 후보 N건 · 검토 대기 M건"(localStorage 닫힘)
  ③ "오늘 볼 것 1건"(수요축 최고 · 검수 미완) ④ "오래 멈춤" 배지(extracted/processing 상태로 7일↑) ⑤ 필터 줄 아래 정체 한 줄(상태별 건수·최장 체류).
- `/analyze/new` — 1단계에 패싯 6개(선택) + 프로필 프리필 + "프로필로 저장" 체크. 2단계에 **"다나와 URL 로 등록하고 밤에 수집"** 경로
  (`/api/analyze/targets`, source_key=danawa) — 붙여넣기와 나란히. 등록되면 "내일 아침 원문이 채워진다. 지금은 붙여넣기로도 시작할 수 있다".
- `/settings/profile` (신규) — seller_profiles 1행 편집. `GET/PUT /api/profile`(로그인 이메일 = owner_email, `lib/auth/session.ts`).
- `app/error.tsx` — 새로고침 / 문의 / 홈 3버튼(한국어).

## 4. API
- `POST /api/analyze/pmf` — {project_id} → 패싯 없으면 400 "진단 입력이 없다"(추정 금지). 산식은 `lib/cases/match.ts` 그대로,
  저장은 `scripts/pmf-assess.mjs` 와 같은 형태(pmf_assessments + pmf_assessment_moves). 응답 { assessment, match, demand, precedent, quadrant, advice }.
  공통 로직은 `lib/cases/pmf-run.ts` 로 빼고 CLI 도 그걸 쓰게 바꾼다(두 벌 금지).
- `GET /api/analyze/remedy?project_id` — `lib/cases/remedy.ts::buildRemedies(aspects, corpora)` — 속성마다 `advise()` 를 호출하되
  terms = 속성명 + notes + market + product_elevator_pitch. 결과에 판정 동사·아래 문장 템플릿 포함.
- `GET /api/analyze/summary?project_id` — 마크다운 문자열(성숙도·사분면·처방·상위 3·보완 사례·앵글 3). 공개 URL 은 만들지 않는다(§5-1).
- `PATCH /api/analyze/projects` — 패싯 6개 갱신. `POST` 도 패싯을 받는다.
- `GET|PUT /api/profile` — seller_profiles.
- `GET /api/analyze/extract?stats=1` — extracted 프로젝트의 (finished−started) 중앙값·표본수.
- `GET /api/analyze/review` — aspects select 에 `evidence_quotes` 추가.

## 5. 추출 프롬프트 (`lib/analysis/extract-run.ts`)
aspect 마다 `"evidence_quotes": ["원문 그대로 1~3문장"]` 를 추가 요구. 정규화: 문자열 배열 → `{ text, source_type:'review' }`, 각 300자 상한, 최대 3.
**LLM 이 지어내지 못하게** 프롬프트에 "입력 원문에 있는 문장만, 바꾸지 말고" 명시하고, 저장 전에 **원문 포함 검사**(`inputs` 중 하나의
`raw_text` 에 그 문장의 앞 20자가 실제로 있는지)로 걸러 통과한 것만 저장한다 — 없는 인용을 있는 것처럼 보여주지 않는다(§7.1).

## 6. 안 하는 것 (리서치 C-3 그대로)
단일 종합 점수 · 광고 소재/스토리보드 · 성과 기반 채점 · 예측 시뮬레이터 · 소셜 계정 연결 · 브라우저 확장 수집 · 실시간 수집 ·
크레딧 미이월 · 공개 URL 대시보드 · 지표 커스터마이즈 · 앱 안 회고 계층.

## 7. 검증 기준 (완성 = 화면)
- 로컬 `next build` · `tsc` · `eslint` · 관련 셀프테스트(신규: `pmf-run-selftest`, `remedy-selftest`, `summary-selftest`) 통과
- 실제 DB 프로젝트 `4fcea3ff-…`(유산균, 원문 278 · 속성 6 · 성숙도 4)로: 패싯 입력 → 진단 → 결과 화면 → 요약 복사까지 **한 번에**
- 375px 폭에서 한 열 세로 쌓기, 풀폭 CTA 1개, 가로 스크롤 0
- 화면 실물 캡처는 Chrome 확장 세션 또는 남헌 브라우저(로그인 벽) — 이 세션은 preview 배포 성공까지 책임진다
