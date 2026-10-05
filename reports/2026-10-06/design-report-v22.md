# 설계 보고서 v22 — 수집 램프·한도 배분·인용/요약 배선·override 기록·품질 현황판·제품 사전 (2026-10-06)

> 작성: CTO 서브에이전트(코드 변경 0 · DB 접근 0 · 마이그 적용 0). 남헌이 읽고 결정하는 문서다.
> 숫자의 출처는 두 가지뿐이다 — (실측) 오케스트레이터가 2026-10-05 밤 PostgREST 로 읽은 값, (코드) 이 리포 main `4b36545` 와 미머지 브랜치의 상수. 그 밖의 숫자는 "제안값"이거나 "측정 필요"다.
> 항목마다 끝에 **남헌 결정 필요** 와 선택지(A/B/C)·대가를 적었다. 마지막 절이 우선순위(첫 고객 전 필수 / 이후)다.

## 0. 먼저 읽을 것 — 확인 못 한 것과 가정

- (가정) "최근 66회 실행 = 3회 슬롯 × 22소스" 라고 받았지만 main 의 `nightly-review-collect.yml` 에는 cron 이 **2개**(17:37Z · 05:37Z)다. 3회째는 수동 `workflow_dispatch` 였거나 미머지 브랜치일 수 있다 — Actions 실행 이력으로 확인 필요. 아래 계산은 하루 2회를 기본으로 두고 3회면 어떻게 달라지는지 따로 적었다.
- (확인 불가) `review_sources.daily_request_cap` 의 **현재 DB 값**. 마이그 등록값(000024 로 3배 인상분 포함)만 읽었고, `scripts/review-request-cap.mjs` 가 매 실행 전 2배 이내로 올릴 수 있어 지금 값은 더 클 수 있다. 램프 표의 "현 상한" 칸은 마이그 기준이다.
- (확인 불가) 마이그 `20261005000003`(quote_policy) · `000004`(정책 백필) · `000005`(googleplay) · `000002`(appstore 예외) 의 적용 여부. `docs/migration-exceptions.md`(main) 에는 000001 만 기록돼 있고 000002 는 "미적용"으로 적혀 있다. 오케스트레이터 실측에 `override=owner_2026-10-05` · `quote_policy` 값이 보이므로 적용된 것으로 **추정**하지만 기록이 없다 — 적용했으면 기록 한 줄이 먼저다.
- (확인 불가) 옛 인용(`evidence_quotes` 항목에 `source_key` 없음)이 몇 건인지, 그중 원문이 이미 폐기된(1,294건 중) 입력에서 나온 인용이 몇 건인지. 둘 다 §3 백필 범위를 정하는 숫자라 **측정 쿼리를 §3 에 적어 뒀다**.
- (확인 불가) claude-cli 구독 한도(5시간 창)와 Gemini 무료 티어의 하루 실제 여유. 판정 백로그 해소안(§5)은 호출 수만 세고 한도는 "확인 불가"로 둔다.
- (코드 사실) 램프 엔진은 main 에 **없다**. `lib/review/ramp.ts`(main)는 계단 상수와 읽기 헬퍼뿐이고 러너는 `--targets=10` 고정이다. 브랜치 `feat/ramp-wiring`(미머지)에 러너 배선(`collectWithRamp`) · 차단 시 안전 되돌리기(`rollbackOnBlock`, 동결 `RAMP_FREEZE_DAYS=3`) · 제외 소스(`RAMP_EXCLUDED = danawa·todayhumor`)가 있다. **올리는 엔진은 어느 브랜치에도 없다.**
- (코드 사실) 인용 길이 규칙은 브랜치 `feat/quote-length-cap`(미머지, v20 #5 기준: 한 문장 ∧ 한국어 100자·영어 200자)이 구현돼 있는데, 이번 v22 #3 이 **한 문장 제한을 없애고 상한을 130/240 으로 바꿨다**. 그 브랜치는 머지 전에 고쳐야 한다(§3).

---

## 1. 램프 단계표

### 1-1. 지금 코드가 정하는 계산식 (근거 파일 그대로)

- 1회 실행이 소스마다 훑는 타깃 수 = `targetLimit` — main 은 워크플로 `--targets=10` 고정, 브랜치는 `review_source_ramp.targets_per_run`(없으면 `RAMP_STEPS[0]=10`). `lib/review/ramp.ts`.
- 타깃 1개가 한 실행에 보낼 수 있는 최대 요청 = `MAX_PAGES_PER_TARGET = 20`(`lib/review/runner.ts:52`). 게시판(`board:`) 타깃은 목록 1 + 글 19(`BOARD_QUEUE_MAX = 19`, `types.ts:400`), 글 단위(`url:`·`q:`·pcode·앱 id) 타깃은 보통 1~20.
- 하루 요청 수요(상한 계산기) = `글타깃 × runs × 1 + 게시판타깃 × runs × 20`, 권장 상한 = `ceil(수요 × 1.3)`, 자동 반영은 현재값의 2배 이내만 (`lib/review/request-cap.ts` `planSourceCap` · `CAP_BUFFER=1.3` · `REQUESTS_PER_BOARD_RUN=20`). `runs` 는 워크플로 YAML 의 `- cron:` 개수를 센다(`countCronSchedules`) — 지금 2.
- 요청 간격 = `max(review_sources.min_interval_ms, robots Crawl-delay)` (`runner.ts` `Pacer`). 램프는 간격을 **건드리지 않는다**(cowork-four-orders §2-2).
- 일일 상한은 **UTC 날짜** 누적이라 두 슬롯이 한 몫을 나눠 쓴다(`store.ts loadSource`, 워크플로 주석). 2회째 슬롯의 뜻은 "상한 증가"가 아니라 "뒤쪽 소스·타깃에 차례를 주는 것"이다.
- 한 실행의 벽시계 상한은 워크플로 `timeout-minutes: 90` 하나뿐이고 **22개 소스가 직렬**로 돈다. 소스별 시간 상한은 없다 — 상한(cap)×간격이 사실상 소스별 시간 상한이다.
- 그래서 소스 1개가 한 실행에 쓰는 최악 시간 ≈ `min(targets_per_run × 타깃당 요청, 남은 일일 상한) × 간격`. 예: clien(5000ms) 게시판 타깃 10개 = 200요청 × 5초 = 약 17분. 전 소스 cap×간격 합(마이그 값 기준)은 하루 약 237분인데 슬롯 2개 × 90분 = 180분이라 **전부 상한까지 돌면 타임아웃에 걸린다**. 지금은 대부분 소스에 타깃이 없어서 안 걸릴 뿐이다.

### 1-2. 실측이 말하는 것 — 병목은 단계가 아니라 타깃

- 66회 실행(2026-10-04 10Z~)에서 타깃을 방문한 소스는 7개: hackernews 30타깃/1,071신규(35.7/타깃) · bobaedream 6/229(38.2) · okky 3/87(29.0) · clien 6/27(4.5) · disquiet 3/26(8.7) · velog 15/2(0.1) · indiehackers 3/0. 나머지 15개 가동 소스는 타깃 0 방문.
- 즉 1회 타깃 수 10 을 올려도 15개 소스는 그대로 0 이고, velog·indiehackers 는 타깃이 있어도 신규가 없다. 램프 상향으로 빨라지는 곳은 **hackernews·bobaedream·okky·disquiet 넷**뿐이다.
- 손잡이가 소스 유형마다 다르다 — (i) 글·검색 타깃 소스(hackernews `q:`, danawa pcode, appstore·googleplay 앱 id, 커뮤니티 `url:`)는 `targets_per_run` 이 양을 정한다. (ii) 게시판 순회 소스(bobaedream·okky·clien·disquiet·velog·devto·yozm·indiehackers 등)는 타깃 수가 게시판 수(소스당 1~6개)라 `targets_per_run` 을 30으로 올려도 효과가 0 이고, 양은 **실행당 글 수(19)** 와 슬롯 수가 정한다.

### 1-3. 제안 — 단계표를 "전역 1벌"에서 "소스 유형별 2벌 + 소스별 상단"으로

- (제안) 계단 상수를 전역 `[10,15,22,30]` 에서 **유형별**로 나눈다. A형(글·검색 타깃): `[10, 15, 22, 30, 45, 60]` level 0~5. B형(게시판): `targets_per_run` 은 그 소스의 게시판 수로 고정하고 대신 **실행당 글 수** 계단 `[19, 29, 39]`(= 페이지 상한 20/30/40 − 목록 1) 을 둔다 — 코드로는 `MAX_PAGES_PER_TARGET` 을 소스별 값으로 받는 작은 변경(러너 `RunOptions.maxPagesPerTarget`, `BOARD_QUEUE_MAX` 를 어댑터 상수에서 러너 인자로). S형(소유자 예외·약관 금지 소스 = googleplay·appstore): `[2, 4, 6, 10, 15]` — googleplay 는 타깃 1개가 최대 20요청×8초=160초라 level 0 이 10이면 첫 실행부터 27분이고 cap 40 을 2타깃에서 다 쓴다. 전역 계단은 이 소스에 맞지 않는다.
- (제안) 마이그 `000034` 의 CHECK `level BETWEEN 0 AND 3` 을 0~5 로 넓히고, `review_source_ramp` 에 `steps integer[]`(그 소스가 따르는 계단, NULL=유형 기본값) 한 칸을 둔다. 계단을 바꿔도 "그때 몇 개로 돌았나"는 `targets_per_run` 에 남는다(기존 설계 유지).
- (제안값, 소스별 상단 단계 — 남헌이 표를 본 뒤 값을 넣는다. 형식: 소스 · 유형 · 간격 · 현 상한(마이그) · 제안 상단 · 상단에서의 하루 수요(runs=2) · 근거)
  - hackernews · A(`q:`, incrementalOnly) · 2000ms · 600 · level 4(45) · 45×2×20×1.3=2,340 · 실측 35.7신규/타깃으로 가장 생산적. Algolia 공개 한도(IP당 시간 10,000)의 1% 미만. 45타깃×20페이지×2초=30분/실행이 벽시계 상한이라 level 5 는 3슬롯 전까지 보류.
  - bobaedream · B · 3000ms · 336 · 글 수 29(페이지 30) · 6게시판×2×30×1.3=468 · 38.2신규/타깃으로 수율 최고. 상한 336→468 은 2배 이내라 자동 반영 가능.
  - okky · B · 4000ms · 300 · 글 수 29 · 3×2×30×1.3=234(현 상한 내) · 29.0신규/타깃. robots Crawl-delay 1s < 4s 유지.
  - disquiet · B · 5000ms · 50 · 글 수 19 유지, **상한부터** 50→104(=1~2게시판×2×20×1.3) · 8.7신규/타깃인데 cap 50 이 게시판 1개 실행 1회(≤20요청)×2슬롯=40 에 거의 붙어 있다. 약관 forbids_automation 소유자 인수 소스라 글 수 계단은 올리지 않는다.
  - clien · B · 5000ms · 462 · **유지(level 0)** · 4.5신규/타깃·5초 간격이라 요청당 수율이 가장 낮다. 올리면 시간만 먹는다.
  - velog · B · 4000ms · 300 · **램프 제외 후보** · 15타깃 2신규(0.1/타깃). 타깃 정리(exhausted 전환·태그 교체)가 먼저다.
  - indiehackers · B · 6000ms · 40 · 유지 · 3타깃 0신규. 어댑터 보고대로 "게시 직후 1회 읽고 댓글 0" 구조라 램프 무관.
  - danawa · A(pcode) · 4000ms · 30 · **제외**(남헌 09-27 최소화 지시, `RAMP_EXCLUDED`).
  - todayhumor · 차단 이력 · **제외**(`RAMP_EXCLUDED`).
  - appstore(켜면) · S · 2000ms · 200 · level 4(15) · 15×2×10×1.3=390 · 앱 1개=최대 10페이지(애플 400 상한). 소유자 예외 소스라 S형 계단. 상한 200→390 은 2배 이내.
  - googleplay(켜면) · S · 8000ms · 40 · level 2(6) 까지 · 6×2×20×1.3=312 · 보수적 시드 40 은 2타깃분이다. 20요청×8초=160초/타깃이라 level 2 가 실행당 16분. 차단 신호 즉시 중단(`abortOnChallenge`)이 전제.
  - 82cook·damoang·theqoo·fmkorea·brunch·tumblbug·naver_blog_post·youtube·producthunt·devto·yozm · 타깃 0 방문 · **단계 논의 보류** · 타깃 공급(§1-6) 뒤 첫 7일 실측으로 유형·상단을 정한다. 상한은 지금 값으로 충분하다(실측 요청 0).
- (제안) 상단 단계와 별개로 **소스별 벽시계 예산**을 둔다: `review_sources.max_run_seconds`(NULL=무제한) 또는 러너 `RunOptions.deadlineMs`. 근거: 직렬 22소스에 90분 하나뿐이라, 한 소스가 30분을 먹으면 뒤 소스가 잘린다(2026-09-22 HN 29분 사고 재발 방지). 새 컬럼 없이 가려면 "cap×간격 ≤ 슬롯 90분/활성소스 수" 를 상승 조건에 넣는 쪽이 코드가 적다(아래 1-4).

### 1-4. 상승 조건 (제안 — 엔진이 없으므로 처음엔 사람·역할 세션이 표를 보고 올린다)

- 창: 직전 **6회 실행**(2슬롯×3일, 3슬롯이면 9회) 연속으로 아래 전부.
- 무차단: `review_collection_runs.blocked_responses = 0` ∧ `quota_responses = 0` ∧ WAF·캡차·빈 응답 중단 0 (마이그 `000033` 적용 이후 행만 — 그 전 행의 0 은 "측정 안 함"이다).
- 오류율: `parse_failures / (reviews_parsed + parse_failures) < 5%`(표본 ≥10) ∧ `status='failed'` 타깃 비율 < 10% ∧ `health_after` 에 broken·degraded 0회.
- 여유: 요청이 상한의 70% 미만 ∧ 실행 시간이 (cap×간격 합 기준) 슬롯 90분의 2/3 이내.
- 공급: 그 소스의 active 타깃 수 ≥ 다음 단계 타깃 수(아니면 올려도 효과 0 — 건너뛰고 "공급 부족"으로 기록).
- 하류: cowork-four-orders §2-3 게이트 그대로 — 직전 7일 추출 대기 프로젝트 ≤5 ∧ extract blocked 0. 판정 백로그(16/1,440)가 지금 이 조건을 못 넘는다 — §5 가 먼저 풀려야 램프를 올릴 수 있다.
- 기록: 올릴 때 `review_source_ramp_log` 1행(`applied_by` = 세션명). 엔진을 만들면 같은 조건을 `lib/review/ramp.ts` 순수 함수로 옮기고 셀프테스트로 고정한다.

### 1-5. 하강 조건과 동결 3일

- 즉시 중단(이미 코드): 403·429·WAF·캡차·2xx 빈 응답(엄격 모드)·연속 삭제글 3건 → 그 소스의 이번 실행을 끊는다(`runner.ts`).
- 한 단계 하강(브랜치): `blocked_responses ≥ 1` → 직전 단계로 내리고 `frozen_until = now + 3일`, 로그 먼저 쓰고 실패하면 단계를 바꾸지 않는다(`rollbackOnBlock`). level 0 이면 더 못 내린다 — 그때는 사람 몫(소스 끄기, §10.1 대로 러너는 `enabled` 를 안 만진다).
- 추가 제안: `degraded`(연속 0건 3회)는 하강이 아니라 **상승 금지**로만 쓴다 — 새 글이 없는 것과 차단은 다른 사건이다(health.ts 설계 그대로).
- 동결 14일→3일의 영향: 14일은 §2-2 "주 1회 +50%" 리듬에서 상승 2회분을 쉬는 값이었다. 3일이면 되돌린 뒤 상승 조건(6회=3일)을 채우자마자 같은 단계를 다시 시도한다 — 즉 차단 → 하강 → 3일 뒤 재상승 → 재차단의 **진동**이 6일 주기로 생길 수 있다. 대가는 요청 낭비가 아니라 같은 호스트에 차단을 반복 유발하는 것이다.
- 진동 방지 제안(선택): 같은 단계에서 **두 번째** 차단이면 동결을 14일로 늘리거나(에스컬레이션) 그 소스의 상단 단계를 한 칸 내려 고정한다(`review_source_ramp.ceiling_level`). 전자는 컬럼 추가 없이 `ramp_log` 를 세면 된다.
- danawa·todayhumor 는 제외 그대로. 소유자 예외 소스(appstore·googleplay)는 차단 1건이면 하강이 아니라 **level 0 + 14일 동결**을 권한다 — 약관 금지를 알고 연 곳이라 "차단 신호 시 즉시 중단"이 남헌 조건이다.

### 1-6. 타깃 공급 — 램프 밖의 본론

- 공급 경로가 지금 셋뿐이다: ① 사람이 마이그로 넣는 `review_targets` INSERT, ② 발굴 엔진(`scripts/discovery-run.mjs`, 하루 `DISCOVERY_TARGET=2`건, saas→hackernews `q:`·physical→danawa pcode 만), ③ 없음 — 제품 사전 ①~⑦은 아직 어디에도 연결돼 있지 않다.
- 제품 사전(`reports/2026-10-05/product-dictionary/`, 254제품 × 소스 6칸)에서 **어댑터가 있는 칸은 둘**이다: `appstore`(id = 숫자 앱 ID → `product_ref = <국가>:<id>`) · `googleplay`(id = 패키지명 → `<gl>:<hl>:<pkg>`). `capterra`·`trustradius` 는 403/약관으로 수집 불가(README 가 명시), `shopify_apps` 는 어댑터·약관 점검 둘 다 없음, `daum_search` 는 검색어 후보일 뿐이고 카카오 검색 어댑터는 리포에 없다(`lib/review/adapters/` 에 kakao 없음 — 카카오 쿼터 30,000/일은 어댑터를 새로 붙여야 쓸 수 있다).
- (제안) 투입 스크립트 `scripts/dictionary-targets.mjs`(새 파일, 대화형·역할 세션이 돌린다 — 무인 루프 금지는 §10.1 대로): 사전 JSON 을 읽어 `status='확인'` 칸만 `review_targets` 로 upsert. 자연키 `(project_id, source_key, product_ref)` 라 재실행 안전. `label` 에 `<area>:<slug>` 를 넣어 영역 집계가 가능하게 한다.
- 프로젝트 단위가 결정 사항이다 — 추출·PMF·인사이트가 전부 `analysis_projects` 단위라 어디에 매달지가 결과 모양을 정한다.
  - A안 **제품당 프로젝트 1개**(254개, `status='collecting'`, `business_model='SAAS'`, `purpose='product_fit'`) — 속성·앵글이 제품별로 나온다(고객이 보는 화면과 같은 단위). 대가: 프로젝트 254개가 판정·추출 큐에 들어가 `RELEVANCE_MAX_PROJECTS=5`·extract 슬롯을 즉시 압도한다 — §5 와 묶어야 한다.
  - B안 **영역당 프로젝트 1개**(7개) + 제품은 타깃 `label` 로만 — 큐 압박 0, "영역별 예상 건수"도 바로 나온다. 대가: 속성이 영역 공통으로 뭉개져 제품 비교가 안 된다(다나와 편향 §1.1 과 같은 종류의 뭉개짐). 첫 고객 화면이 "제품"을 묻는다면 맞지 않다.
  - C안 **A 를 영역 하나(예: ⑦ 이커머스 운영)부터** — 48개 프로젝트로 큐 영향을 실측하고 다음 영역으로. 권고.
- 발굴 엔진 쪽: `DISCOVERY_TARGET` 2→5 는 리포 변수만 바꾸면 되지만 채택률이 실측 hits 로 정해져 늘어난 몫만큼 안 들어올 수 있다. 사전 투입이 더 확실한 경로다.
- exhausted 타깃 되살리기: 15개 0방문 소스 중 타깃이 `exhausted`·`failed` 로 잠긴 곳이 있을 수 있다(`listDueTargets` 는 active 만 본다). 실측 쿼리: `select source_key, status, count(*) from review_targets group by 1,2` — 결과에 따라 `20260930000006` 식 재활성 마이그.

### 남헌 결정 필요 (§1)

- Q1-1 계단을 유형별 3벌(A/B/S)로 나누는 안 — A 승인 / B 전역 1벌 유지하되 상단만 6단계로 / C 보류(엔진부터).
- Q1-2 위 1-3 의 소스별 제안 상단 값 — 표를 본 뒤 소스별로 넣을 값(빈칸 = 유지).
- Q1-3 동결 3일 진동 방지 — A 같은 단계 2회째 차단이면 14일 / B 3일 고정 / C 상단 고정 컬럼 추가.
- Q1-4 제품 사전 → 타깃 투입 단위 — A 제품당 / B 영역당 / C 영역 ⑦부터 제품당(권고).
- Q1-5 소스별 벽시계 예산 — A `max_run_seconds` 컬럼 / B 상승 조건으로만(코드 적음, 권고) / C 3슬롯 추가.

---

## 2. 한도 배분 규칙 — 7개 영역 × 소스

### 2-1. 현재 단계 (코드 사실)

- 소스 안 순서 = `review_targets.status='active'` 를 `last_run_at NULLS FIRST` 로 `targets_per_run` 개(`store.ts listDueTargets`). 영역·제품·신규/백필 구분이 없다 — 한 번도 안 돈 타깃이 먼저, 그다음은 오래 안 돈 순.
- 소스 간 순서 = `ADAPTERS` 객체 키 순서(`review-collect.mjs`) 고정. 일일 상한은 소스별·UTC 날짜. 영역별 한도는 존재하지 않는다(영역 개념이 DB 에 없다).
- 판정(T2) 순서 = `status='collecting'` 프로젝트를 `created_at` 오름차순 → SaaS 우선(`compareAutoPriority`) → 하루 5프로젝트 × 표본 200.

### 2-2. 규칙 제안 (한 줄씩)

- 새 글 우선: 같은 소스 안에서 `cursor IS NULL`(첫 실행) 과 증분형(`incrementalOnly`·게시판 목록) 타깃을 먼저, 깊은 페이지를 이어 읽는 백필(직전 outcome 이 "페이지 상한 20 도달")은 그 뒤.
- 남는 건 백필: 일일 상한의 70% 를 새 글 몫으로 먼저 쓰고, 남은 30% 안에서만 백필 타깃을 집는다. 70/30 은 선택값이다 — 근거 있는 값이 아니라 "새 글이 비면 백필이 전부 먹는다"를 막는 바닥이다.
- 제품당 건수 적은 제품 우선: `ORDER BY total_collected ASC` 를 두 번째 키로 — 이미 수백 건인 제품이 10건짜리 제품의 차례를 먹지 않게.
- 영역별 최소량: `targets_per_run` 을 영역 수로 나눈 몫(10/7 → 1)을 각 영역에 먼저 배정하고 나머지를 위 순서로 채운다. 영역이 하나뿐인 소스(bobaedream 등 커뮤니티)는 그대로.
- 소스별 상한: 지금 `daily_request_cap` 그대로. 영역별 상한은 두지 않는다 — 최소량만 보장하면 상한은 소스 상한이 대신한다.
- 판정 한도도 같은 규칙: 프로젝트 순서를 `created_at` 대신 **미판정 건수 많은 순 → 영역 라운드로빈** 으로.

### 2-3. 구현 분해와 다음 단계 조건

- 0단계(지금, 변경 0): FIFO. 영역 개념 없음.
- 1단계(PR 1개, 코드 10줄): `listDueTargets` 정렬을 `(cursor IS NULL) DESC, total_collected ASC, last_run_at NULLS FIRST` 로. 새 글 우선·적은 제품 우선 둘이 한 줄로 들어온다. 영역 컬럼 없이 가능.
- 2단계(마이그 1 + PR 1): 영역을 DB 에 둔다 — A `analysis_projects.area text`(①~⑦ 코드, NULL=미지정) / B `review_targets.area`. 타깃은 프로젝트에 매달리고 영역은 제품의 속성이라 A 가 정규화에 맞다. 진입 조건: 사전 투입(§1-6)으로 **한 소스에 영역이 2개 이상** 생긴 뒤.
- 3단계: `listDueTargets` 가 `limit×7` 후보를 읽어 JS 에서 영역 라운드로빈 + 70/30 백필 몫을 적용(순수 함수 + 셀프테스트). 진입 조건: 2단계 적용 + 어느 소스든 영역별 신규 건수가 3일 연속 한쪽으로 80% 이상 쏠릴 때(쏠림이 없으면 3단계는 필요 없다).

### 남헌 결정 필요 (§2)

- Q2-1 1단계 정렬 변경을 바로 할지 — A 지금(권고, 되돌리기 revert 한 줄) / B 사전 투입 뒤.
- Q2-2 영역 컬럼 위치 — A `analysis_projects.area`(권고) / B `review_targets.area`.
- Q2-3 새 글/백필 몫 70/30 — 값 승인 또는 다른 값.

---

## 3. 인용·요약 배선과 재추출 계획 — 첫 고객이 보기 전까지

### 3-1. 갭 목록 (파일·줄, 읽은 그대로)

- `app/analyze/[id]/result/page.tsx:365-391` — `evidence_quotes[].text` 를 그대로 `“…”` 로 2건. 정책 맵 조회 없음. 로그인 벽 안(허용목록) 화면.
- `lib/cases/summary.ts:119-120` — "요약 복사" 마크다운에 첫 인용을 그대로. 화면 밖으로 나가는 유일한 산출물이라 고객 화면과 같은 규칙이어야 한다. 호출부 `app/api/analyze/summary/route.ts`.
- `lib/insights/evidence.ts:83-85` → `quoteLines`(`lib/analysis/quote-display.ts`) → `app/_pub/components/PubInsightEvidence.tsx:30-49` — 번역(`evidence_quotes_ko`)과 원문 둘 다 그대로. 정책 맵 없음. `/insights` 는 `PUBLIC_EXACT` 에 없어 로그인 벽 안이지만 `_pub` 디자인(고객용)이다.
- `app/_pub/components/PubInsightCard.tsx:42` — `item.evidence` = `analysis_angles.substantiation_evidence` 를 `excerptOf(…,140)` 로 자른 것(`lib/insights/feed.ts:349`). judge 가 뽑은 원문 문장이라 **인용이면서 정책·일치 검사가 없다**. 이 경로를 빠뜨리면 다른 넷을 고쳐도 원문이 새어 나간다.
- `lib/signals/feed.ts` `/voc`·`/voc/community`·`/voc/card`(공개) — 정책은 `quoteOf` 로 걸려 있으나 `QUOTE_POLICY_COLUMN_READY=false` 라 **발췌가 전부 빈 칸**이다(fail-closed). 000003 적용 확인 뒤 true 로 바꾸는 한 줄이 남아 있다.
- `app/library/[slug]/page.tsx` 블록 7(VOC 인용)은 비워 둔 상태 — 갭 아님. `case_evidence.snippet`(:120)은 사람이 적은 케이스 근거라 리뷰 인용 규칙 밖이다(별도 판단).
- 내부 화면 `app/analyze/[id]/review/page.tsx` · `/relevance/grade` 는 원문을 그대로 보는 것이 목적이라 손대지 않는다.

### 3-2. 정책 맵 배선 설계

- 로더 1개: `lib/analysis/quote-policy-db.ts` `loadQuotePolicies(sb): Promise<Map<string, unknown> | null>` — `review_sources` 에서 `key, quote_policy` 한 번(26행). 42703(컬럼 없음)·조회 실패 → `null`(= 전부 비표시, §7.1). 요청당 1회 호출, 캐시는 두지 않는다(행 26개).
- 적용 함수는 이미 있다: `publicQuotes(quotes, policies)`(`evidence-quotes.ts:73`) — `source_key` 없는 옛 인용·맵에 없는 키·none 은 뺀다, short_only 는 `source_key` 를 떼고 낸다. 여기에 v22 길이 규칙(`checkQuote`, 아래 3-3)을 붙인다.
- 배선 4곳: result 페이지(aspects 조회 뒤 `publicQuotes`), summary 라우트(같은 맵을 `buildSummaryMarkdown` 에 넘겨 순수 함수 안에서 거른다), insights evidence(`loadInsightEvidence` 가 맵을 받아 `quoteLines` 전에 거른다 — `quotesKo` 배열은 원문과 인덱스가 짝이라 **같은 인덱스를 함께 걸러야** 번역이 엇갈리지 않는다), `PubInsightCard.item.evidence`(`feed.ts:349` 에서 앵글의 속성 `evidence_quotes` 중 `substantiation_evidence` 와 일치하는 항목의 `source_key` 로 정책을 본다 — 일치하는 게 없으면 비표시).
- 출처명·링크·작성자는 지금처럼 어느 정책에서도 내지 않는다(D안 유지). `source_type`("review" 등) 표시는 출처명이 아니므로 유지.

### 3-3. v22 #3 규칙을 코드로 — `feat/quote-length-cap` 수정점

- 삭제: `isOneSentence` 검사와 `multi_sentence` 사유(v20 #5). 한 문장 제한은 없다.
- 상한: `QUOTE_MAX_KO 100→130`, `QUOTE_MAX_EN 200→240`(하드). 넘으면 자르지 않고 인용 불가 → 요약 경로로.
- 목표 약 100자: 저장(추출) 프롬프트에 "가능하면 100자 안팎의 문장"을 적는 정도로만. 코드는 하드 상한만 검사한다(목표는 품질 지표, 게이트 아님).
- 언어 판정 `quoteLang`(한글 비중 ≥10% → ko)은 그대로. `unknown`(글자 없음)은 엄격한 쪽(130) 유지.
- (a) 인용 = 원문 그대로 — 저장 시 `normalizeEvidenceQuotes` 의 앞 20자 포함 검사는 유지하되, 고객 노출 직전에 **한 번 더** 전문 일치를 확인할 수 없다(원문이 폐기되면 대조 불가). 그래서 "일치 확인됨" 표식을 저장 시점에 남긴다 — 3-4 의 `verified` 플래그.
- (b) 요약 = 줄여 쓴 문장 — 새 값이 필요하다. 자리: `evidence_quotes` 항목 객체에 `summary: string` 을 더한다(jsonb 라 마이그 없음). 만드는 곳: extract 7-2 단계(번역 `translateProjectQuotes` 바로 뒤, 같은 claude-cli 묶음 호출 — 프로젝트당 1회)와 백필 스크립트 `scripts/aspect-quotes-summary-backfill.mjs`(`aspect-quotes-ko-backfill.mjs` 복제). 요약 규칙: 원문 의미만, 100자 이내, 새 주장 금지, 출처·작성자 없음.
- UI 규약: 인용 통과 → `“…”` 따옴표 + 캡션 "리뷰 원문 인용". 인용 불가(길이 초과·정책 none·옛 인용) ∧ 요약 있음 → 따옴표 없이 본문 + 앞에 `요약` 라벨(Chip) + 캡션 "원문을 줄여 쓴 문장". 둘 다 없음 → "인용 없음 — 재분석하면 채워진다"(지금 문구 유지). 번역(`_ko`)은 인용 통과분에만 붙인다 — 요약은 이미 한국어로 쓴다.
- 요약을 정책 `none` 소스에도 낼지는 규칙에 없다 — Q3-2.

### 3-4. 옛 인용 처리 — 재추출 vs 입력 대조 백필

- 문제: 2026-10-05 이전 저장 인용에는 `source_key` 가 없어 `publicQuotes` 가 전부 뺀다(fail-closed). 그대로 두면 첫 고객이 보는 `/insights`·결과 화면의 인용이 **옛 프로젝트에서 전부 사라진다**.
- 측정(먼저): `select count(*) filter (where q->>'source_key' is null) as legacy, count(*) as total from analysis_aspects a, jsonb_array_elements(a.evidence_quotes) q` — legacy 건수. 그리고 그 속성들의 프로젝트에서 `analysis_inputs.raw_text is null`(폐기) 비율.
- 백필 방식(권고): `scripts/aspect-quotes-source-backfill.mjs` — 속성별로 같은 프로젝트의 보존 원문(`raw_text` 비NULL, 41,994건) 전체를 `squash` 해 (1) 전문 포함 → `verified:'full'`, (2) 아니면 앞 20자 포함(저장 시와 같은 기준) → `verified:'prefix'`, (3) 둘 다 없음 → `verified:'none'`(출처 없음 = 고객 화면 비표시). 찾은 입력의 `source_key` 를 항목에 쓴다. 드라이런으로 분포를 먼저 본다. 대량 UPDATE 라 §10.2 4조건(드라이런·롤백=원 jsonb 보관 컬럼 없음 → 변경 전 `evidence_quotes` 를 `reports/` 가 아니라 **DB 백업 테이블**에 복사·무중단·Notion 기록) 아래 역할 세션이 적용.
- 재추출(대안): 옛 프로젝트를 다시 `extract` 하면 `source_key` 가 자동으로 붙지만 `human_confirmed`·교정값이 delete→insert 로 날아간다(설계 §6). 사람 검수가 있는 프로젝트에는 쓰면 안 된다. 검수 0건 프로젝트에만 선택적으로.
- 폐기된 원문(1,294건)에서 나온 인용은 어느 방법으로도 출처를 되살릴 수 없다 — `verified:'none'` 으로 남기고 요약(3-3 b)으로 대체한다. 요약은 인용문 자체에서 쓰므로 원문이 없어도 만들 수 있다.

### 3-5. PR 분해와 일정 (순서가 곧 의존성)

- PR-Q0(0.1일) 마이그 000003·000004·000005·000002 적용 상태를 `information_schema` 로 확인하고 `docs/migration-exceptions.md` 에 기록. 미적용이면 적용(비파괴·롤백 있음·§10.2 예외 아님 — 단 000002·000005 는 남헌 명시 예외 소스라 기록에 그 근거를 적는다).
- PR-Q1(0.5일) `feat/quote-length-cap` 을 v22 로 수정(문장 제한 삭제·130/240·`summary` 필드 타입) + 셀프테스트 갱신 + 머지.
- PR-Q2(0.5일) 정책 로더 + 4곳 배선(3-2) + `QUOTE_POLICY_COLUMN_READY=true`(Q0 뒤) + `summary` 표시 규약 UI(Chip `요약`) — `app/**/*.tsx` 변경이라 web-design-guidelines 통과 기록 필요(§7.3).
- PR-Q3(0.5일 + 실행) 옛 인용 `source_key`·`verified` 백필 스크립트(드라이런 → 분포 보고 → 적용).
- PR-Q4(1일) 요약 생성 — extract 7-2 단계 + 백필 스크립트 + 프롬프트. 호출 수 = 프로젝트 수(번역과 같은 묶음) — 비용은 claude-cli 구독 창 안, 건수는 Q3 측정 뒤.
- 첫 고객 전 필수: Q0·Q1·Q2·Q3. Q4 는 "인용 없음" 문구로 버틸 수 있으면 이후(단, 옛 인용이 많으면 화면이 비어 보이므로 Q3 결과를 보고 정한다).

### 남헌 결정 필요 (§3)

- Q3-1 옛 인용 — A 입력 대조 백필(권고, 검수값 보존) / B 검수 0건 프로젝트만 재추출 + 나머지 백필 / C 옛 인용은 숨기고 요약만.
- Q3-2 정책 `none` 소스(citation_allowed=false 포함)에 요약을 낼지 — A 요약도 내지 않음(권고 — none 은 "근거로도 인용 안 함"이 컬럼 뜻) / B 요약은 허용.
- Q3-3 `substantiation_evidence`(judge 인용) 경로를 같은 규칙으로 묶을지 — A 묶음(권고) / B 별도 규칙.
- Q3-4 "목표 약 100자"를 게이트로 둘지 — A 프롬프트 지시만(권고) / B 100자 초과는 요약으로 전환.

---

## 4. override 사용 기록 DB 저장

- 현재: 러너가 소유자 예외로 통과시킨 요청 수를 `RunResult.robotsOwnerOverride` 로 센다(`runner.ts:185·564·821`). `review-collect.mjs`(main)는 그 값을 요약에도 DB 에도 쓰지 않는다. 브랜치 `feat/ramp-wiring` 의 `reports/2026-10-05/override-record-diff.md` 가 요약 줄 1개 + `sourceResults` 필드 1개를 더하는 최소안(미적용)이다. `robotsBypassed`(확인 불가 표식 통과)도 같은 처지로 DB 에 없다.
- 왜 DB 가 필요한가: 예외는 남헌이 날짜 붙여 연 것이고(`owner_2026-10-05`), "그 예외로 실제 몇 요청을 보냈나"가 실행 요약(Actions 로그 90일)에만 남으면 나중에 예외를 되돌릴 때 근거가 없다. 차단 건수를 DB 로 옮긴 이유(`000033` 머리말)와 같다.
- (제안 A, 권고) 마이그 `2026100600000N_review_run_override_counts.sql` — `review_collection_runs` 에 `robots_owner_override integer NOT NULL DEFAULT 0 CHECK (>=0)`, `robots_bypassed integer NOT NULL DEFAULT 0 CHECK (>=0)`, `override_value text`(그 실행 시점 `review_sources.override` 스냅샷, NULL=예외 없음). 비파괴 ADD COLUMN 3개, 백필 없음, 롤백 파일. `lib/review/run-log.ts finishRunRow` 가 `BLOCK_COUNT_KEYS` 와 같은 패턴으로 세 필드를 더 쓰고 42703 이면 빼고 재시도 + 경고. 이전 행의 0 은 "측정 안 함"(COMMENT 로 명시).
- (제안 B) 별도 감사 테이블 `review_override_log(run_id, source_key, override_value, host, requests, created_at)` — 예외를 쓴 실행에만 행이 생겨 runs 가 넓어지지 않는다. 대가: 테이블·RLS·쓰기 경로가 하나 더, 조회가 조인.
- (제안 C) DB 저장 없이 요약 줄 + Notion CTO 행에만 — 비용 0, 대가는 90일 뒤 소실.
- 함께 적을 것: `override_value` 스냅샷이 있어야 나중에 `review_sources.override` 를 NULL 로 되돌린 뒤에도 "어느 실행이 예외로 돌았나"가 남는다. 값 형식은 컬럼 주석대로 `<주체>_<YYYY-MM-DD>`.
- 보고: `review-collect-status.mjs`(Notion CTO 행)에 "소유자 예외 사용 N건(소스)" 한 줄 — 0 이면 줄 없음.

### 남헌 결정 필요 (§4)

- Q4-1 A(컬럼 3개, 권고) / B(별도 테이블) / C(저장 안 함).
- Q4-2 `robots_bypassed`(확인 불가 표식 통과)도 같이 저장할지 — A 같이(권고, 같은 패턴 한 번에) / B 소유자 예외만.

---

## 5. 품질 현황판 + 분류 샘플 검수 + 판정 백로그

### 5-1. 지표 정의 (전부 기존 컬럼으로 계산 가능 — 새 테이블 없음)

- 총 건수: `analysis_inputs where source_type='review' and source_key is not null` — 누적·오늘(`collected_at` KST 날짜).
- 어제 대비: 오늘 신규 − 어제 신규, 소스별.
- 한국어 건수: 5-2.
- 쓸모 있는 글 비율: `relevant ∧ product_informative=true` / 판정된 건수(`review_relevance_verdicts`, 사람 채점 있으면 사람 값 우선). "판정 커버리지"(판정/신규)를 **옆에 반드시** 같이 낸다 — 16/1,440 상태에서 비율만 보면 오독한다.
- 노이즈 비율: `irrelevant` / 판정된 건수. `unknown` 은 분모에 넣되 분자 어디에도 넣지 않는다(§7.1).
- 분류 정확도: 사람 채점 vs LLM 일치율 — `scripts/relevance-eval-report.mjs` 가 이미 매일 요약에 찍는다. 현황판은 그 값을 읽기만.
- 충분성: 프로젝트별 relevant 건수와 extract 문턱(신규 ≥100) 대비, 속성 0개 프로젝트 수.
- 소스 상태: `lib/review/latest-health.ts` 의 2값(최근 실행 판정 또는 "확인 불가 N연속" · 마지막 판정 broken 며칠 전) 그대로. 실패한 소스 = broken ∨ 오늘 `status='failed'` ∨ `blocked_responses>0`.
- 순서(남헌): 총 건수 → 어제 대비 → 한국어 건수 → 쓸모 있는 글 비율(+커버리지) → 실패한 소스.

### 5-2. 한국어 건수 집계 방법

- 선언값 `analysis_inputs.lang` 은 요청에 언어를 지정한 소스(googleplay `hl`)만 채우고 "추정하지 않는다"가 컬럼 규약이다(마이그 000001 주석). 그대로 세면 한국어 건수가 googleplay 뿐이라 쓸모없다.
- (제안) 추정값을 **다른 칸**에 둔다: `analysis_inputs.lang_guess text`(ko/en/unknown) — 밤마다 `scripts/input-lang-backfill.mjs` 가 `raw_text` 비NULL ∧ `lang_guess IS NULL` 행에 `quoteLang()`(한글 비중 ≥10% → ko, 브랜치 `evidence-quotes.ts`)을 돌려 채운다. LLM 0, 결정적. 폐기된 원문(1,294건)은 `unknown` 이 아니라 NULL 로 남긴다(측정 불가와 판정 불가를 가른다).
- 대안: 집계 시점 SQL `raw_text ~ '[가-힣]'` — 컬럼 없이 되지만 42k 행 정규식을 화면마다 돈다. 하루 1회 배치가 맞다. 또는 `lang` 에 추정값을 쓰고 `lang_basis`(declared/guessed) 칸을 두는 B안 — 컬럼 규약을 바꿔야 해서 권하지 않는다.
- 현황판 한국어 건수 = `lang='ko' OR lang_guess='ko'`.

### 5-3. 현황판 자리

- A(권고) 로그인 화면 `/collection`(새 라우트, `app/_ds` 운영 톤) — 읽기 전용, 서버 컴포넌트에서 위 집계를 소스×영역으로. 영역은 §2 의 `area` 컬럼이 생기기 전엔 소스만.
- B Notion CTO 행에 숫자 5개를 매일 적는다(화면 없음) — `review-collect-status.mjs` 확장. 가장 싸다. 대가: 추세를 못 본다.
- C `/dashboard`(발행 연결 수리 화면)에 섹션 추가 — 성격이 달라 권하지 않는다.
- 우선 B 를 하루 만에, A 는 영역 컬럼 뒤에.

### 5-4. 분류 샘플 검수 — 영역×소스 20건, 맞다/틀리다, 하루 5분

- 이미 있는 것: `/relevance/grade`(하루 15장, 층 A~D 할당 6/4/3/2, 단축키 1~5 로 관련/무관/모름/정보있음/정보없음, 사람 값은 `human_verdict`·`human_product_informative` 에 저장, LLM 값은 안 덮는다). `scripts/relevance-grading-sample.mjs`(마크다운 채점표) + `relevance-grading-import.mjs` 도 있다.
- (제안 A, 권고) `/relevance/grade` 에 **층을 하나 더** 추가한다: `E 영역×소스 대표`(하루 20장 — 소스마다 최대 3장, 영역마다 최소 1장, 나머지는 신규 많은 소스부터). 버튼은 "맞다/틀리다" 2개 — 맞다 = `human_verdict := verdict`(LLM 값 복사), 틀리다 = 반대값(`relevant↔irrelevant`, `unknown` 은 표본에서 뺀다 — 기존 규칙). 저장 경로·컬럼은 그대로라 새 테이블 0, `lib/relevance-feedback/sample.ts` 순수 함수 + 셀프테스트만 는다. 5분 안에 20장은 단축키 2개면 된다.
- B 새 화면 `/relevance/quick` — 빠르지만 채점 저장 경로가 두 벌이 된다.
- C 마크다운 채점표(`relevance-grading-sample.mjs --n 20`)를 아침에 뽑아 체크 → import. 화면 변경 0, 대가는 사람 손이 두 번.
- 정확도 산출은 층별로 따로 — E 층의 일치율이 "영역×소스 분류 정확도"다. 기존 `relevance-feedback` 요약 화면이 층별로 이미 낸다.

### 5-5. 판정 백로그 16/1,440 을 푸는 법

- 지금 구조: 하루 1슬롯(19:03Z) · `RELEVANCE_MAX_PROJECTS=5` · 프로젝트당 표본 200(T1 점수 상위) · `status='collecting'` 만 · `created_at` 오름차순→SaaS 우선. 호출은 20건/배치라 이론 상한 5×200=1,000건/일인데 실측 16건.
- 원인 후보(확인 불가 — 측정이 먼저): (a) 같은 5개 프로젝트가 매일 선택되고 그 프로젝트의 상위 200 은 이미 판정돼 신규가 적다, (b) 신규 1,440건이 6번째 이후 프로젝트나 `collecting` 이 아닌 프로젝트에 들어간다, (c) T1 이 페인 낱말·길이로 뽑아 신규라도 점수 낮은 글은 200 안에 못 든다, (d) Actions 지연·타임아웃(2026-09-22 실측 프로젝트당 약 11분). 측정 쿼리: 신규 1,440건을 `project_id`·프로젝트 `status`·판정 유무로 그룹.
- 손잡이(코드 적은 순): ① 리포 변수 `RELEVANCE_MAX_PROJECTS` 5→20(코드 0), ② 프로젝트 순서를 "미판정 건수 많은 순"으로(스크립트 정렬 한 줄 — 신규가 몰린 프로젝트부터), ③ 표본을 "T1 상위 200" 에서 "**미판정 신규 우선** 200" 으로, ④ 슬롯 2개(워크플로 cron 1줄, §10.2 워크플로 4조건), ⑤ 2차 판정(Gemini) 상한 `RELEVANCE_SECOND_MAX=200` 도 같이.
- 비용 근거: 1,440건/일 = 72 호출/일(20건/배치). 2026-09-22 실측(200건≈11분)으로 환산하면 약 80분 → 1슬롯 90분 안에 턱걸이라 ④ 가 필요하다. 구독 한도(5시간 창)는 **확인 불가** — 첫날 ①②③ 만 켜고 429 발생 여부로 재되, 실패 시 `budget.ts` 가 아니라 CLI 429 로 멈추므로 다음날 재개된다(스크립트 규약).
- 위 §1-4 의 램프 상승 조건 "추출 대기 ≤5" 와 연결된다 — 판정이 늘면 extract 수요도 는다. §2-3 "extract 먼저 2배" 순서는 그대로.

### 남헌 결정 필요 (§5)

- Q5-1 현황판 자리 — A `/collection` 화면 / B Notion 행(먼저, 권고) / C 둘 다.
- Q5-2 한국어 추정 칸 — A `lang_guess` 새 컬럼(권고) / B `lang` 에 추정 + `lang_basis` / C 집계 시 SQL 정규식.
- Q5-3 샘플 검수 — A `/relevance/grade` 층 E 추가(권고) / B 새 화면 / C 마크다운.
- Q5-4 백로그 손잡이 ①②③ 즉시 + ④ 슬롯 추가 — 승인 여부와 `RELEVANCE_MAX_PROJECTS` 값(제안 20).

---

## 6. 제품 사전 구조 · 소스 등록부 · 글 단위 칸 — 한 장

### 6-1. 소스 등록부 `review_sources` (현재 칸)

- `key`(PK, 어댑터 키와 철자 동일) · `display_name` · `enabled` · `disabled_reason` · `disabled_at`(마이그 000051 사용).
- `min_interval_ms`(≥1000) · `daily_request_cap`(>0, 무인 루프가 올리기만 가능, 로그 `review_source_cap_log`).
- `health` · `health_detail` · `health_checked_at` — DEPRECATED(000045), 판정은 `review_collection_runs.health_after`.
- `robots_status`(allowed/disallowed/unverified/not_applicable, NULL=미기록) · `tos_status`(permitted/silent/prohibited/unverified/forbids_automation, NULL=미기록) · `last_test_result`(사람·셀프테스트 한 줄).
- `citation_allowed`(false ⇒ 근거로도 인용 안 함) · `quote_allowed`(DEPRECATED) · `quote_policy`(full/short_only/none, CHECK: citation false ⇒ none, 약관 금지 ⇒ full 불가) · `override`(`<주체>_<날짜>`, 러너 소유자 예외는 `owner_2026-10-05` ∧ robots disallowed 일 때만) · `privacy_check`(§1.2-4 메모, NULL=미점검).
- 제안 추가: `max_run_seconds`(§1-3, 선택) · 램프 계단은 별도 테이블 `review_source_ramp(level, targets_per_run, frozen_until, steps[])`.

### 6-2. 수집 타깃 `review_targets`

- `project_id`(FK analysis_projects) · `source_key`(FK) · `product_ref`(소스별 형식: danawa pcode / appstore `<국가>:<앱ID>` / googleplay `<gl>:<hl>:<pkg>` / hackernews `q:<검색어>` / 커뮤니티 `url:<경로>` · `board:<slug>` / youtube `v:<id>`) · `label`.
- `cursor` · `last_review_at` · `status`(active/exhausted/failed) · `consecutive_empty` · `last_run_at` · `total_collected` · `created_at`. 자연키 `(project_id, source_key, product_ref)`.
- 제안 추가: 없음(영역은 프로젝트 쪽 §2-3).

### 6-3. 글 단위 `analysis_inputs` (수집기가 채우는 칸)

- `project_id` · `source_type`('review') · `raw_text`(폐기되면 NULL) · `source_key` · `collected_at` · `purged_at` · `created_at`.
- 2026-10-05 추가(000001): `rating`(0~5 정규화, 없으면 NULL) · `lang`(요청에 지정한 소스만, 추정 금지) · `source_url`(https, 내부 보존용 — 고객 화면 비표시).
- 지문 `review_fingerprints(source_key, identity_key, content_hash, product_ref, written_at, revision_count, key_kind, analysis_input_id)` — 원문 폐기 뒤에도 남는다.
- 판정 `review_relevance_verdicts(verdict, second_verdict, product_informative, second_product_informative, human_verdict, human_product_informative, human_graded_at, impact, frequency, community_signal, wtp_mentioned, auto_approved_at, auto_approval_rule, model, judged_at, reason)`.
- 제안 추가: `lang_guess`(§5-2) · 인용 항목(`analysis_aspects.evidence_quotes[]`)에 `source_key`·`verified`·`summary`(§3, jsonb 안이라 마이그 없음).

### 6-4. 제품 사전 JSON (`reports/2026-10-05/product-dictionary/area-0N-*.json`)

- 파일 머리: `area` · `area_ko` · `scope`(포함·제외 기준) · `researched_at` · `kr_search_queries[]`.
- 제품: `slug`(7파일 전체 유일, 254개) · `name` · `name_ko` · `name_ko_basis` · `region`(global/kr) · `official_url` · `summary_ko` · `selection_basis`.
- 제품×소스 칸 `sources.<소스>` : `key`(`<slug>:<소스>`) · `status`(확인/미발견/확인 불가/검색어) · `id` · `url` · `evidence`. 소스 6개: googleplay · appstore · capterra · trustradius · shopify_apps · daum_search — 어댑터 있는 것은 googleplay·appstore 둘.
- 영역별 제품 수: ① 31 · ② 26 · ③ 22 · ④ 34 · ⑤ 33 · ⑥ 60 · ⑦ 48. 확인 불가 칸 ①63 · ②55 · ③45 · ④28 · ⑤26 · ⑥80 · ⑦56(대부분 Capterra·TrustRadius).
- 영역별 **예상 수집 건수·분류 비용: 측정 필요** — 사전에는 "페이지가 있다"만 있고 리뷰 수가 없다. 첫 투입(§1-6 C안, 영역 ⑦ 48제품의 appstore·googleplay '확인' 칸)을 7일 돌린 실측으로만 적는다. 분류 비용도 그 7일의 판정 호출 수(20건/배치)로 환산한다.
- 사전→DB 연결 칸(제안): `analysis_projects.area`(①~⑦) + `review_targets.label = <area>:<slug>`. 사전 JSON 의 `key` 문자열을 그대로 `label` 에 쓰면 역추적이 된다.

### 남헌 결정 필요 (§6)

- Q6-1 사전 '확인' 칸 중 투입 대상 소스 — A appstore·googleplay 둘(권고, 어댑터 있음) / B appstore 만(googleplay 는 1회 실측 뒤) / C 보류.
- Q6-2 `shopify_apps`·`daum_search`(카카오 검색) 어댑터 신설 여부 — 둘 다 §1.2 법적 점검 미실시 → `ops/state/source-review-queue.md` 로 올릴지.

---

## 7. 우선순위 제안

### 첫 고객 전 필수 (화면에 원문이 새거나 비어 보이는 것부터)

1. §3 PR-Q0 마이그 000003·000004·000005·000002 적용 상태 확인·기록(0.1일).
2. §3 PR-Q1 `feat/quote-length-cap` v22 수정·머지(0.5일) → PR-Q2 정책 맵 배선 4곳 + `QUOTE_POLICY_COLUMN_READY=true` + 요약 라벨 UI(0.5일).
3. §3 PR-Q3 옛 인용 측정 → `source_key`·`verified` 백필(0.5일 + 적용).
4. §5-5 판정 백로그 — 리포 변수 `RELEVANCE_MAX_PROJECTS` 상향 + 정렬·표본 2줄(0.5일). 고객이 보는 "쓸모 있는 글 비율"의 분모가 16건이면 어떤 현황판도 의미가 없다.
5. §4 override 기록 마이그 + `finishRunRow` 확장(0.5일) — 남헌이 연 예외의 사용량이 DB 에 남아야 예외를 유지·회수할 근거가 생긴다.

### 이후 (첫 고객 뒤, 순서대로)

6. §1-6 제품 사전 → 타깃 투입 스크립트(영역 ⑦부터) + §2 1단계 정렬 한 줄(0.5일) — 램프보다 먼저. 실측 7일.
7. `feat/ramp-wiring` 머지(러너 배선·되돌리기·동결 3일) + §1-3 유형별 계단(마이그 CHECK 확장·`steps[]`)(1일) — 투입 뒤 7일 실측이 있어야 상단 값을 넣는다.
8. §5 현황판 — Notion 행(0.5일) → `lang_guess` 백필(0.5일) → `/relevance/grade` 층 E(0.5일) → `/collection` 화면(영역 컬럼 뒤, 1일).
9. §2 2·3단계(영역 컬럼·라운드로빈) — 한 소스에 영역 2개 이상 생긴 뒤.
10. §3 PR-Q4 요약 생성(1일) — Q3 측정에서 옛 인용·폐기 원문 비중이 크면 5번 앞으로 당긴다.

### 결정 질문 모음 (위 절의 번호 그대로)

- Q1-1 ~ Q1-5 (램프 계단·소스별 상단·동결 진동·사전 투입 단위·벽시계 예산)
- Q2-1 ~ Q2-3 (정렬 변경 시점·영역 컬럼 위치·70/30)
- Q3-1 ~ Q3-4 (옛 인용 처리·none 요약·judge 인용 경로·100자 게이트)
- Q4-1 ~ Q4-2 (override 저장 방식·bypassed 동반)
- Q5-1 ~ Q5-4 (현황판 자리·한국어 추정 칸·샘플 검수 방식·백로그 손잡이)
- Q6-1 ~ Q6-2 (사전 투입 소스·새 어댑터 큐)

### 참조 파일 (절대 경로)

- 램프·상한: `C:\Users\DCU\Desktop\Cowork\SolutionArchive\lib\review\ramp.ts` · `lib\review\request-cap.ts` · `lib\review\runner.ts` · `lib\review\store.ts` · `lib\review\types.ts` · `.github\workflows\nightly-review-collect.yml` · `supabase\migrations\20260930000034_review_source_ramp.sql` · `20260930000033_review_run_block_counts.sql` · `20260930000024_review_cap_3x_saas_sources.sql` · `reports\2026-09-28\cowork-four-orders.md` §2-2·§2-3 · 브랜치 `origin/feat/ramp-wiring`.
- 인용: `lib\analysis\evidence-quotes.ts` · `lib\analysis\quote-display.ts` · `lib\analysis\quote-translate.ts` · `lib\insights\evidence.ts` · `lib\insights\feed.ts` · `lib\signals\feed.ts` · `lib\cases\summary.ts` · `app\analyze\[id]\result\page.tsx` · `app\_pub\components\PubInsightEvidence.tsx` · `app\_pub\components\PubInsightCard.tsx` · `supabase\migrations\20261005000001~000005` · 브랜치 `origin/feat/quote-length-cap`.
- override: `lib\review\run-log.ts` · `scripts\review-collect.mjs` · 브랜치 `feat/ramp-wiring` 의 `reports\2026-10-05\override-record-diff.md`.
- 판정·검수: `.github\workflows\nightly-relevance.yml` · `scripts\relevance-judge-auto.mjs` · `lib\analysis\relevance-judge.ts` · `lib\analysis\extract-select.ts` · `lib\relevance-feedback\sample.ts` · `app\relevance\grade\page.tsx` · `supabase\migrations\20260929000002_review_relevance_verdicts.sql`.
- 사전·소스: `reports\2026-10-05\product-dictionary\README.md` · `scripts\discovery-run.mjs` · `ops\state\source-review-queue.md` · `docs\review-collection-design.md` §1.2·§4·§9.
