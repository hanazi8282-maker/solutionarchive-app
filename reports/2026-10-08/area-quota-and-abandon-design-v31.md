# 영역별 T2 판정 배정·포기 기준·대시보드 설계 (v31, 2026-10-08)

> **구현 메모(2026-10-09, feat/v37-areas-config):** 구현은 정본 `config/areas.json`과 `analysis_projects.area_code`(마이그 20261009000020)를 쓴다. 이 문서의 "끄는 길 = `data/area-map-v26.json` 값 변경", "영역 = 라벨 접두만", pitch 임시 귀속은 초안 가정이다. 순서·상태 규칙은 `lib/analysis/area-priority.ts`·`lib/review/target-supply.ts`, 뷰는 마이그 20261009000040이 정본이다.

읽기 전용 설계. 코드·DB 를 건드리지 않았다. 수치는 전부 파일:줄 또는 오케스트레이터가 준 값이고, 못 본 것은 "확인 불가"로 적었다.

## 0. 결론 3줄

- T2 는 지금 **영역을 모른다.** 프로젝트 순서는 SaaS → 첫 추출 → 미판정 많은 순(`lib/analysis/extract-auto.ts:100-110`)이고, 표본은 T1 점수 상위 200건(`scripts/relevance-judge-auto.mjs:206`)이다. 영역 최소량은 정렬 맨 앞에 **순위 한 축**을 더하면 되고(코드 ~40줄), 평점 규칙은 표본 자르기 직전 **한 줄 분기**다.
- 영역 정보는 DB 컬럼이 아니라 `review_targets.label` 접두 `"<1~5>:<slug>"`(`scripts/dictionary-targets.mjs:141`)에만 있다. 접두 없는 옛 타깃은 투입 스크립트가 쓰는 같은 키(`product_elevator_pitch` 문자열, `:221`)로 사전과 맞춰 임시 귀속한다 — DB 쓰기 0.
- 포기 기준은 코드가 **판정만** 하고 끄지 않는다. 끄는 길은 `data/area-map-v26.json` 값 변경 PR 하나뿐이고 그건 남헌 몫이다.

## 1. 지금 코드가 하는 것 (사실)

- 후보 프로젝트: `analysis_projects.status ∈ AUTO_EXTRACT_STATUSES`(`relevance-judge-auto.mjs:159`). 이 상태 밖 프로젝트는 영역과 무관하게 **영영 판정 안 된다.**
- 프로젝트당 표본: `selectInputs(inputs).selected.slice(0, sampleSize)`(`:206`), sampleSize 기본 200(`:63`, 워크플로 `nightly-relevance.yml:100`). 이미 판정된 것만 뺀다(`:222`). 그래서 **한 프로젝트는 평생 최대 200건만 판정된다** — ① 1,876건 중 54건이 적은 게 아니라, 구조상 프로젝트 1개면 200이 천장이다. 커버리지는 "입력 대비 %"가 아니라 "영역 최소량 대비"로 읽어야 한다.
- T1 점수: `(1+페인히트) × 길이밴드 × 최신성`(`lib/analysis/extract-select.ts:69-71`). **평점은 안 본다.** `pendingFor` 의 SELECT 에 `rating` 이 없다(`relevance-judge-auto.mjs:196`).
- `rating` 컬럼: `analysis_inputs.rating smallint 0~5`(마이그 `20261005000001:24,30`), 앱스토어(`lib/review/adapters/appstore.ts:76-97`)·구글플레이(`googleplay.ts:87`)만 채운다. HN·카카오·커뮤니티는 NULL.
- 프로젝트 순서: `compareAutoPriority`(`extract-auto.ts:100-110`) — SaaS 0/1 → 첫추출 → 미판정 많은 순 → id. 호출 `relevance-judge-auto.mjs:287-294`. 하루 상한 5프로젝트(`:65`).
- 영역 정의: `data/area-map-v26.json` 값 "1"~"5"|"hold"|"out"|null(남헌 v27). ① 회의록 ② 영업 보조 ③ 마케팅·콘텐츠 ④ 인사(평가만) ⑤ 리뷰 관리(`reports/2026-10-07/target-supply-design-v30.md` §6). 옛 7영역 파일(`reports/2026-10-05/product-dictionary/area-01..07`)과 번호가 다르다.
- 영역이 DB 에 닿는 유일한 자리: `review_targets.label = "<영역>:<slug>"`(`dictionary-targets.mjs:141`). 읽는 쪽 `lib/review/target-supply.ts:175-178 areaOf()`. `analysis_inputs`·`analysis_projects` 에 영역 컬럼 없음(`reports/2026-10-07/v33-audit-code.md` §2 L65-67).
- 영역 대시보드 = `scripts/target-supply.mjs:89-90` 의 "영역 활성" 한 줄(Actions job summary). 값은 `computeSupply` L302-313 의 `areas{active,minimum,state}`. 입력·판정 수는 안 읽는다(`loadSupplyInputs` L36-74 는 sources·ramp·targets·runs 만).

### 1.1 오케스트레이터 수치를 새 번호로 옮기면

옛 7영역 번호(①회의록 ②CS ③영업 ④마케팅 ⑤글쓰기 ⑥채용 ⑦이커머스, README 기준)로 받은 값이다. 옛 영역 귀속을 어떤 키로 했는지는 리포에 없다 → **귀속 방법 확인 불가**, 아래는 번호만 옮긴 것.

| 새 영역 | 판정/입력 | 메모 |
|---|---|---|
| ① 회의록 | 54 / 1,876 | 최소량 미달 |
| ② 영업 | 400 / 1,550 | 충족 |
| ③ 마케팅 | 0 / 852 | 미달·0 |
| ④ 인사 | 확인 불가 | 옛 ⑥ 값이 없음 |
| ⑤ 후보 글쓰기 | 200 / 3,121 · 관련 0 | 충족이나 관련 0 → §3 즉시 트리거 |
| ⑤ 후보 리뷰관리 | 확인 불가 | kakao q: 8타깃뿐(v30 §6) |
| 보류 CS·이커머스 | 0/2 · 0/594 | 순위 최하, 삭제 없음 |

## 2. (A) 판정 배정 개편

### 2.1 영역 최소량 — 제안 200건, 근거

- **200 = 지금 표본 단위 하나.** 프로젝트 1개 = 200건 = 20건 묶음 10회 호출(`relevance-judge.ts:52`). 하루 상한 5프로젝트 = 50호출 = 정확히 5영역 × 200. 첫 사이클을 **하루 밤**에 끝낼 수 있는 값이다.
- **통계:** 관련 비율 추정 95% 구간 — n=150 ±8.0%p, n=200 ±6.9%p (p=0.5 기준, 1.96·√(p(1−p)/n)). §3 의 (b) 임계 30% 에 대해 n=200 이면 관측 20% 의 구간(13~27)이 30 을 벗어난다 → **판정 가능.** n=150 은 22~28 로 겨우 벗어난다. 150 은 하한, 200 을 기본으로 둔다.
- **다양성 보정(남헌 선택):** 200 을 프로젝트 1개로 채우면 "영역 관련 비율"이 아니라 "제품 1개 비율"이 된다. 최소량 채우는 동안 `RELEVANCE_SAMPLE=100`(리포 변수, 코드 0줄 — `voc-expansion-investigation.md` §5-4 C안)으로 두면 영역당 프로젝트 2개 이상이 섞인다. 대가: 첫 사이클 2밤. 기본 권고는 **200 + 표본 100**.
- 최소량은 env `RELEVANCE_AREA_FLOOR`(기본 200). 영역별로 다르게 둘 이유가 아직 없다 — 데이터 보고 조정.

### 2.2 정렬 위치와 최소 변경

바꿀 자리는 둘이다.

- **프로젝트 순서** `relevance-judge-auto.mjs:287-294`. `compareAutoPriority` 앞에 영역 결손 축을 넣는다.
  ```
  rank = 결손영역(판정수<FLOOR, 활성 1~5) 0 → 충족·unmapped 1 → hold/out 2
  sort: rank → (같은 결손끼리) 결손 큰 영역 먼저 → compareAutoPriority(기존)
  ```
  `compareAutoPriority` 자체는 손대지 않는다(extract 와 한 벌이라 `extract-auto.ts:94-95` 경고대로 두 벌 금지). T2 쪽에서 앞단 비교자 하나를 **감싸는** 형태.
- **영역별 판정 수**는 새 조회 없이 나온다. `pendingFor`(`:193-225`)가 이미 `judged` 집합을 읽는다(`:208-217`). `done.size` 를 반환값에 더하고 영역별로 합치면 끝.
- **영역 귀속**은 `review_targets.select('project_id,label')` 한 번(§2.4). `areaOf` 는 `target-supply.ts:175` 를 `export` 로 바꿔 재사용.
- hold/out 프로젝트: 제외하지 않고 **맨 뒤**. 남헌 지시가 "우선순위 최하·삭제 금지"다. 활성 영역이 전부 충족이고 상한이 남으면 그제야 돈다.
- 로그: 대상 선정 줄(`:303-310`)에 `영역 판정수/최소량` 5칸과 각 프로젝트의 영역을 붙인다. `tracker.step('select')`(`:330-339`) detail 에 `area_floor`·`area_judged` 추가.

### 2.3 평점 규칙 — 표본 자르기 직전 한 분기

- 자리: `relevance-judge-auto.mjs:206` 의 `.slice(0, sampleSize)` 를 `pickSampleByRating(selected, sampleSize, HI_SHARE)` 로 바꾼다. SELECT(`:196`)에 `rating` 추가.
- 규칙(순수 함수, `lib/analysis/relevance-judge.ts` 의 `pickGradingSample`(L384) 옆):
  ```
  rated = rating != null 인 것
  rated 0건 → 기존 그대로 slice(n)          (HN·카카오·커뮤니티 제외 조항)
  low  = rating ≤ 3 ∪ rating null   (T1 점수 순 유지)
  high = rating ≥ 4
  hiCap = ceil(n × HI_SHARE)          HI_SHARE 기본 0.20
  sample = low[0 : n − min(hiCap, |high|)] ++ high[0 : hiCap]
  모자라면 남은 high 로 채운다(관련 후보를 버리지 않는다)
  ```
  - null 평점을 low 와 같은 줄에 두는 이유: 한 프로젝트에 앱스토어(평점)·카카오(없음) 타깃이 섞일 수 있다. null 을 뒤로 밀면 "평점 없는 소스 제외" 조항을 어긴다.
  - rating 0 은 ≤3 이라 low. 다나와 4.5→5 반올림(`lib/review/store.ts:29,32`)은 high.
  - 자르기는 **판정 완료 제거(`:222`) 전**에 한다 — 지금과 같은 자리. 표본 200 의 구성이 바뀔 뿐 "프로젝트당 200 천장"은 그대로.
- 조정 로그: 프로젝트 줄(`:309`)에 `평점 저 X · 고 Y/상한 Z · 없음 W` 를 찍고, `tracker.step('select').detail.high_rating_share` 에 값을 남긴다. 20% 를 바꾸는 날은 env 값 + Notion 일일 상태 로그 한 줄이 근거다(§10.2 기록 조건과 같은 형식).
- 2차 판정(`relevance-second-judge-auto.mjs:53-57`)은 1차 행을 따라가므로 손댈 것 없음.

### 2.4 영역 라벨이 판정 선택까지 오는 길 (+ 소급 전 임시 방편)

- **정식 경로(지금 있는 것):** `analysis_inputs.project_id → review_targets.project_id → label 접두`. 투입 때 `label = "<tag>:<slug>"`(`dictionary-targets.mjs:141`). 한 프로젝트의 타깃이 여럿(kr/us·appstore/googleplay)이어도 slug 가 같아 접두가 같다. 접두가 둘 이상 섞이면 "확인 불가"로 두고 뒤로 민다(v33 SQL B 가 그 검사).
- **접두 없는 프로젝트(옛 appstore·HN `q:`·커뮤니티·v27 전 투입분):** 투입 스크립트가 프로젝트를 찾는 키가 `product_elevator_pitch` 문자열이다(`dictionary-targets.mjs:213-221`, `productPitch` L122 = `"<name> (<name_ko>) — <summary_ko>"`). 그러니 같은 함수로 사전 7파일(`loadAreas`, L94)을 돌려 `pitch → slug → area-map-v26 값` 지도를 만들고, 프로젝트 pitch 와 **정확히 일치**할 때만 귀속한다. 부분 일치·유사도는 쓰지 않는다(§7.1 — 모르는 걸 귀속으로 접지 않는다). 둘 다 안 맞으면 `unmapped` = 충족 영역과 같은 순위(기존 동작 유지).
  - 필요한 변경: `productPitch` export(L122) 1줄 + 판정 스크립트에서 지도 생성 ~10줄. DB 쓰기 0.
  - 한계: pitch 를 사람이 고친 프로젝트는 못 맞춘다 → 그건 아래 소급 SQL 이 잡는다.
- **소급 부여(쓰기 — 오케스트레이터 판단, 이 문서는 제안만):** 접두 없는 `review_targets.label` 에 pitch 일치로 찾은 `"<area>:<slug>"` 를 UPDATE. 대량 UPDATE 4조건(드라이런·롤백·무중단·Notion) 대상. 영역 컬럼(`analysis_projects.area`)은 v30 §6 대로 전제가 아니고 소비자가 셋(판정·대시보드·CMO 필터) 이상 생길 때 다시 본다.
- **hold/out 판정:** `area-map-v26.json` 값이 hold/out 인 slug 의 프로젝트는 pitch 경로로만 알 수 있다(투입이 안 되니 접두 타깃이 없다). 이게 ⑥⑦ "순위 최하"를 구현하는 유일한 길이다.

### 2.5 상태 필터와의 상호작용 (놓치면 영역 최소량이 안 찬다)

- `:159` 상태 필터 밖(`extracted` 는 포함, 그 밖 상태) 프로젝트는 영역 결손이어도 후보가 아니다. ③ 마케팅 0/852 가 **상태 때문**인지 **순서 때문**인지는 SQL S5 로 가른다. 상태 때문이면 이 설계로는 안 찬다 — 그때는 상태 집합 확장이 별 결정이다.
- `relevanceFailedState` 제외(`:264-275`)도 같다.

## 3. (B) 영역 포기·교체 기준안 — 숫자는 남헌이 정한다

### 3.1 사이클 정의

- 1 사이클 = **7일.** 앱 소스 재방문 목표가 1/7(`target-supply.ts:136-137`)이라 활성 타깃 전부를 한 번 도는 길이다. 판정은 매일 1회(`t2-execution-structure.md` 결론). 평가 시점 = 영역이 접두 타깃을 처음 받은 날 + 14일, + 21일.

### 3.2 세 기준 — 기본값·근거·민감도

| 기준 | 기본값 제안 |
|---|---|
| (a) 입력 100건↑ 프로젝트 수 | ≥ 3 |
| (b) T2 관련 비율 | ≥ 30% (n ≥ 150) |
| (c) 프로젝트당 입력 | 중앙값 ≥ 50 |

- **(a) 3 / 100.** 100 = `EXTRACT_AUTO_MIN_NEW`(`extract-auto.ts:37`) — 이 밑이면 야간 extract 대상이 아니라 속성이 0개다. 3 = 케이스 무브 자동 승인의 연결 VOC ≥3(CLAUDE.md L342)·칼럼 "인용 3~5개가 같은 빈자리"(v33 §2 L68)와 같은 수. 제품 1~2개로는 "영역 패턴"이 아니라 "그 제품 불만"이다.
  - 민감도: 2 로 내리면 경쟁 1쌍만 있어도 통과(거짓 통과). 5 로 올리면 ② 영업(한국 제품 2개, README)은 구조적으로 못 넘는다 — 소스 교체로도 안 된다.
- **(b) 30%.** 실측: 소비재 69%(`voc-expansion-investigation.md` §5-1), 전체 49.8%·소비재 93%/SaaS 50%(09-27·28 보고, 리포 밖 메모리 — 확인 불가 표시). 30 은 관측된 SaaS 50 의 한참 아래라 "⑤ 글쓰기 관련 0" 같은 진짜 실패만 걸린다.
  - 분모 = relevant + irrelevant. `unknown` 은 빼고, unknown 이 20% 를 넘으면 비율 자체를 **확인 불가**로 둔다(§7.1 — 모델이 못 정한 걸 무관으로 세지 않는다).
  - 민감도: n=200 의 ±7%p 때문에 **25~35% 는 회색 띠** — 한 사이클 더 본다. 20 으로 내리면 글쓰기(0%)만 걸리고, 40 으로 올리면 SaaS 수준 영역이 경계에서 오탐.
- **(c) 중앙값 50.** 평균은 ⑤ 3,121 처럼 한 제품이 끌어올리면 가려진다. 50 = extract 문턱의 절반 — "반은 왔다" 선. (a) 와 겹치지 않게 중앙값으로 둔다.
  - 민감도: 30 이면 거의 다 통과(기준 무력), 100 이면 (a) 와 같은 말이라 중복.

### 3.3 절차 — 영역은 스스로 꺼지지 않는다

1. 14일·21일 평가에서 하나라도 미달 → **소스 교체 시도** 1 사이클: 사전의 다른 소스 칸(appstore↔googleplay, `--sources`), kakao `q:` 검색어(v30 §6 "코드 20줄"), 발굴 큐. 이 단계는 세션 자율(새 법적 리스크 없는 소스만, §10.1 "깨끗한 소스").
2. 그래도 미달(28일) → Notion 일일 상태 로그 `사람판단필요=true`, 제안 셋 중 하나: 축소(최소량 100으로)·교체(⑤ 후보 바꾸기)·보류(hold). §10.2 예외 5(사업 방향)·6(명시 지시 충돌) 해당.
3. 끄는 행위 = `data/area-map-v26.json` 값을 hold/out 으로 바꾸는 PR. **코드는 이 파일을 쓰지 않는다**(`loadAreaMap` 은 읽기만, L108-111). 대시보드 상태값은 `ok | 소스교체 | 사람판단` 까지만 낸다.
4. 예외 — 즉시 1단계: 최소량을 이미 채웠는데 (b) 가 10% 미만(⑤ 글쓰기 200/0). 2사이클 기다릴 이유가 없다.
5. ⑤ 택1: 글쓰기·리뷰관리 둘 다 최소량 도달 뒤 (b) 로 비교. 리뷰관리는 타깃 8개뿐이라 (a) 는 적용 보류("가능 타깃 전부 = 충족", v30 §6).

## 4. (C) 영역 대시보드 열 추가

- 자리: `target-supply.mjs:89-90` 영역 줄 + `computeSupply` L302-313 `areas`. 지금은 활성 타깃 수만.
- 더할 값(영역당): `judged`(판정 행) · `floor`(최소량) · `coverage = judged/floor %` · `relevant_pct`(분모 rel+irr, unknown>20% 면 null) · `low_rated_pct = rating≤3 판정 / 평점 있는 판정` · `inputs`(purged 제외) · `state ∈ met|short|unverified` 와 §3 `abandon ∈ ok|retry_source|needs_human|unverified`.
- 데이터는 **DB 뷰 하나**로 받는다(사다리: 앱에서 analysis_inputs 1만 행을 끌어 모으는 것보다 Postgres 가 group by 하는 게 맞다). 뷰 `v_area_t2_coverage` = §6 S2 의 SELECT 그대로, `security_invoker=true`·`search_path` 고정(선례 `20260927000002_post_performance_invoker_search_path.sql`). 롤백 파일 함께.
- 뷰가 없으면(PGRST205 — HEAD 는 204 함정, GET 으로 확인) 열 전체를 `확인 불가` 로 찍는다. 0 으로 안 찍는다.
- 한계: 뷰는 label 접두만 본다. pitch 임시 귀속분은 안 들어온다 → 소급 부여 전까지 `unmapped` 행의 크기가 그 한계를 그대로 보여준다.

## 5. (D) [Opus] 구현 단위와 수용 기준

- **U1 영역 결손 순위 (relevance-judge-auto.mjs + target-supply.ts areaOf export + dictionary-targets.mjs productPitch export)**
  - 수용: `--dry` 로그에 영역 5칸 `판정/최소량` 과 프로젝트별 영역이 찍힌다. 셀프테스트(가짜 행): 결손 영역의 소비재 프로젝트가 충족 영역의 SaaS 프로젝트보다 앞, hold 프로젝트가 맨 뒤, 접두·pitch 둘 다 없으면 unmapped 로 기존 순서. DB 쓰기 0. `compareAutoPriority` diff 0.
- **U2 평점 표본 (relevance-judge.ts 순수 함수 + 호출부 2줄 + SELECT rating)**
  - 수용: 셀프테스트 — 저 200·고 100·n=200 → 저 160·고 40; 전부 null → 기존 slice 와 동일 순서; 저 20·고 300 → 저 20·고 180; 로그 줄에 세 수와 상한. `analyze-relevance-selftest.mjs` 에 케이스 추가.
- **U3 뷰 + 대시보드 열 + 포기 상태 (마이그 1쌍, target-supply.ts/.mjs)**
  - 수용: 마이그 하단 확인 쿼리(뷰 존재·행 수·unmapped 행 존재). `summaryMarkdown` 에 열 5개. 뷰 없을 때 `확인 불가` 문자열(0 아님) — 셀프테스트로 PGRST205 모의. 상태 계산은 §3.2 세 값의 순수 함수, 기본값은 env(`AREA_MIN_PROJECTS_100=3`·`AREA_MIN_RELEVANT_PCT=30`·`AREA_MIN_MEDIAN_INPUTS=50`).
- **U4 워크플로 env (nightly-relevance.yml)** — `RELEVANCE_AREA_FLOOR`·`RELEVANCE_HIGH_RATING_SHARE` 두 줄. 자율 범위(CLAUDE.md L476-485), 드라이런 dispatch 1회.
- 순서: U2 → U1 → U4 → U3. U2 가 가장 작고 독립이라 먼저. U1 은 U2 와 같은 파일이라 충돌 피해 순차.
- 소급 라벨 UPDATE 는 Opus 단위가 아니다 — §6 S6 결과를 보고 오케스트레이터가 정한다.

## 6. 읽기 전용 SQL (오케스트레이터 실행용)

컬럼 존재부터. `purged_at`·`rating`·`label` 은 코드가 쓰고 있어 있을 가능성이 높지만 information_schema 로 확인한다.

```sql
-- S0 컬럼 존재
select table_name, column_name from information_schema.columns
where table_schema='public' and (
  (table_name='analysis_inputs' and column_name in ('rating','purged_at','collected_at','source_key'))
  or (table_name='review_targets' and column_name in ('label','status'))
  or (table_name='review_relevance_verdicts' and column_name in ('verdict','human_verdict','second_verdict','auto_approved_at','judged_at')))
order by 1,2;

-- S1 프로젝트 → 영역(label 접두). 접두가 둘 이상인 프로젝트는 mixed
with t as (
  select project_id, (regexp_match(label,'^([1-5]):'))[1] as area from public.review_targets where label ~ '^[1-5]:'
)
select project_id, case when count(distinct area)=1 then min(area) else 'mixed' end as area
from t group by 1;

-- S2 영역별 커버리지(= 뷰 본문). unmapped 행이 임시 귀속 전의 한계 크기
with pa as (
  select project_id, case when count(distinct (regexp_match(label,'^([1-5]):'))[1])=1
         then min((regexp_match(label,'^([1-5]):'))[1]) else 'mixed' end as area
  from public.review_targets where label ~ '^[1-5]:' group by 1
), proj as (
  select p.id as project_id, coalesce(pa.area,'unmapped') as area, p.status
  from public.analysis_projects p left join pa on pa.project_id=p.id
)
select proj.area,
  count(distinct proj.project_id)                                   as projects,
  count(i.id) filter (where i.purged_at is null)                    as inputs,
  count(v.input_id)                                                  as judged,
  count(*) filter (where coalesce(v.human_verdict,v.verdict)='relevant')   as relevant,
  count(*) filter (where coalesce(v.human_verdict,v.verdict)='irrelevant') as irrelevant,
  count(*) filter (where coalesce(v.human_verdict,v.verdict)='unknown')    as unknown,
  count(v.input_id) filter (where i.rating is not null)              as judged_rated,
  count(v.input_id) filter (where i.rating <= 3)                     as judged_low_rated
from proj
left join public.analysis_inputs i on i.project_id=proj.project_id
left join public.review_relevance_verdicts v on v.input_id=i.id
group by 1 order by 1;

-- S3 영역별 (a)·(c): 입력 100건↑ 프로젝트 수, 프로젝트당 입력 중앙값
with pa as (select project_id, min((regexp_match(label,'^([1-5]):'))[1]) as area
            from public.review_targets where label ~ '^[1-5]:' group by 1),
 per as (select pa.area, i.project_id, count(*) filter (where i.purged_at is null) n
         from pa join public.analysis_inputs i on i.project_id=pa.project_id group by 1,2)
select area, count(*) filter (where n>=100) as projects_100plus,
       percentile_cont(0.5) within group (order by n) as median_inputs,
       round(avg(n)) as mean_inputs, count(*) as projects
from per group by 1 order by 1;

-- S4 평점 분포: 전체 vs 판정분 (평점 보유 소스만). 20% 조정 근거
select i.source_key,
  count(*) filter (where i.rating<=3) as all_low, count(*) filter (where i.rating>=4) as all_high,
  count(v.input_id) filter (where i.rating<=3) as judged_low, count(v.input_id) filter (where i.rating>=4) as judged_high,
  count(*) filter (where i.rating<=3 and coalesce(v.human_verdict,v.verdict)='relevant') as low_relevant,
  count(*) filter (where i.rating>=4 and coalesce(v.human_verdict,v.verdict)='relevant') as high_relevant
from public.analysis_inputs i left join public.review_relevance_verdicts v on v.input_id=i.id
where i.rating is not null and i.purged_at is null group by 1 order by 1;

-- S5 ③ 마케팅 0건이 상태 때문인지: 영역별 프로젝트 status 분포 (후보 상태 = extract-gate AUTO_EXTRACT_STATUSES)
with pa as (select project_id, min((regexp_match(label,'^([1-5]):'))[1]) as area
            from public.review_targets where label ~ '^[1-5]:' group by 1)
select pa.area, p.status, count(*) from pa join public.analysis_projects p on p.id=pa.project_id group by 1,2 order by 1,2;

-- S6 접두 없는 프로젝트의 pitch — 임시 귀속·소급 부여 후보 목록(사전 productPitch 와 오프라인 대조)
select p.id, p.status, p.product_elevator_pitch, count(i.id) as inputs
from public.analysis_projects p
left join public.review_targets t on t.project_id=p.id and t.label ~ '^[1-5]:'
left join public.analysis_inputs i on i.project_id=p.id and i.purged_at is null
where t.id is null group by 1,2,3 order by inputs desc;

-- S7 옛 7영역 재현용: 접두 영역별 slug 목록(사전 area-0N 파일과 오프라인 join)
select (regexp_match(label,'^([1-5]):'))[1] as area, substring(label from '^[1-5]:(.*)$') as slug, count(*) targets
from public.review_targets where label ~ '^[1-5]:' group by 1,2 order by 1,2;
```

## 7. 확인 불가 (추측하지 않은 것)

- 오케스트레이터 수치의 옛 영역 귀속 키(라벨인지 pitch 인지 슬러그인지). ④ 인사 값 없음.
- 리포 변수 실제 값 `RELEVANCE_SAMPLE`·`RELEVANCE_MAX_PROJECTS`(`gh variable list` 미실행, t2-execution-structure.md §확인 불가와 같음).
- `rating`·`purged_at`·`label` 컬럼이 실제 DB 에 있는지(S0). 코드가 쓰고 있고 마이그 파일은 있으나 적용 여부는 못 봤다.
- 49.8%·93%/50% 관련 비율은 세션 메모리 값이고 리포 보고서에서 다시 찾지 못했다 — §3.2 (b) 의 보조 근거로만 썼다.
- `analysis_projects.product_elevator_pitch` 를 사람이 고친 프로젝트 수(S6 결과로 안다).

## 8. 자가검증 (`_principles.md` §0)

- 대안 검토: ① `analysis_projects.area` 컬럼 신설 + 백필 — 소비자가 아직 둘이라 미룸(v30 §6 과 같은 판단). ② 영역별 별도 워크플로/크론 — 상한·한도 가드가 두 벌이 돼 기각. ③ T1 점수에 평점 가중 곱하기 — extract 선별까지 바뀌어 범위 초과, 표본 자르기 한 곳으로 좁힘. ④ 평점 20% 를 "고평점 전체의 20%"로 해석 — 표본 크기가 평점 분포에 끌려가 기각, "표본의 20%"로 확정.
- 찾은 개선점: 프로젝트당 200 천장(§1) 때문에 "커버리지 %" 지표가 영영 낮게 나온다 → 최소량 대비로 정의를 바꿨다. 상태 필터(§2.5)가 영역 결손의 숨은 원인일 수 있어 S5 를 추가했다.
- 남은 위험: pitch 정확 일치는 보수적이라 unmapped 가 클 수 있다. S6 으로 크기를 먼저 보고 소급 UPDATE 를 정한다.
