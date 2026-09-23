# VOC 수집 확장 조사 — 6개 항목 실측

- **실측 시각: 2026-09-23 16:13 KST** (DB·GitHub Actions 동시 조회)
- 대상: Supabase `qmgrfqjfxqhxuufrnkwf` · 리포 `main` @ `c580bb7`
- 범위: **조사·보고만**. 코드·DB·브랜치 변경 0. 이 파일 1개만 새로 씀(커밋 안 함).

## 사용한 조회 요약

MCP Supabase 도구가 이 세션에 없어 `.env.local` 의 `SUPABASE_SERVICE_ROLE_KEY` 로
PostgREST 를 **GET 만** 호출했다(쓰기·RPC 없음). 집계는 행을 내려받아 node 로 계산했다.

| # | 조회 | 성격 |
|---|---|---|
| Q1 | `GET /review_sources?select=key,enabled,min_interval_ms,daily_request_cap,health,disabled_reason` | 20행 전건 |
| Q2 | `GET /review_targets?select=id,project_id,source_key,product_ref,label,status,consecutive_empty,total_collected,last_run_at,cursor` | 113행 전건 → status×source_key 교차 |
| Q3 | `GET /analysis_projects?select=id,status,business_model,bottleneck,extract_finished_at,product_elevator_pitch,...` | 38행 전건 |
| Q4 | `GET /analysis_inputs?select=id,project_id,source_key,raw_text,created_at,collected_at` (Range 페이징 500) | 16,229행 전건 → 길이·페인낱말 계산 |
| Q5 | `GET /analysis_aspects?select=project_id,name,opportunity_score,quadrant` | 55행 전건 |
| Q6 | `GET /review_relevance_verdicts?select=input_id,project_id,verdict,human_verdict,model,judged_at,reason` | 780행 전건 |
| Q7 | `GET /agent_runs`, `GET /agent_run_steps?order=updated_at.desc` | 30 / 197행 (실행 시각·소요·비용) |
| Q8 | `GET /case_studies`, `GET /case_moves` | 53 / 106행 (검수 큐 상태) |
| Q9 | `gh run list --limit 40 --json ...` + `gh run view 35780298943 --log` | Actions 실제 시작·종료·취소 사유 |

페인 유형은 `config/pain-terms.json` 16종의 `terms` 를 `raw_text` 소문자 부분문자열로
매칭했다 — `lib/analysis/extract-select.ts` 의 `painHits` 와 **같은 방식**이다.

---

# 1. 파이프라인 하루 여러 번 실행

## 1-1. 현재 cron·실제 시작·소요 (2026-09-22~23 밤, `gh run list` 실측)

| 워크플로 | cron(UTC) | 예정 KST | **실제 시작(UTC)** | 지연 | **실제 소요** | 결과 |
|---|---|---|---|---|---|---|
| Nightly Discovery | `13 17` | 02:13 | 20:08:57 | **+2h56m** | 1분 08초 | success |
| Nightly Review Collect | `37 17` | 02:37 | 20:26:26 | **+2h49m** | **30분 00초** | **cancelled (timeout 30분)** |
| Nightly Hacker News Enrich | `19 18` | 03:19 | 21:21:44 | **+3h02m** | 8분 57초 | success |
| Nightly Extract | `33 18` | 03:33 | 21:36:00 | **+3h03m** | 9분 59초 | success |
| Nightly Relevance Judge | `3 19` | 04:03 | 21:46:52 | **+2h43m** | **45분 20초** | **cancelled (timeout 45분)** |

- 설계 의도(24분 간격 순차)는 **우연히** 지켜졌다 — 5개가 모두 2h43m~3h03m 비슷하게 밀려
  상대 순서가 유지됐다. 지연 폭이 20분만 달랐으면 순서가 뒤집힌다.
- 순차 의존은 **코드가 아니라 cron 시각뿐**이다. discovery→collect 는 워크플로 헤더에
  "부르지 않는다"로 명시, collect→extract 도 별 잡. `needs:`·`workflow_run` 트리거 0개.

## 1-2. 두 잡이 timeout 에 잘려 죽는다 — 여기가 병목의 실체

**Collect(30분 timeout):** `gh run view 35780298943 --log` 원문:

```
20:26:48  대상 소스: danawa, appstore, hackernews, damoang, 82cook, bobaedream,
          tumblbug, naver_blog_post, theqoo, todayhumor, brunch, clien, fmkorea,
          okky, velog, youtube
20:27:14  ### danawa  — 24.3초 · 타깃 2개 · 요청 2건
20:27:16  ### appstore — 건너뜀(enabled=false)
20:56:43  ##[error]The operation was canceled.
```

`hackernews` 가 20:27:16 → 20:56:43 = **29분 27초를 혼자 쓰고 잘렸다.** 그 뒤 순서인
**13개 소스(damoang·82cook·bobaedream·tumblbug·theqoo·todayhumor·brunch·clien·fmkorea·okky·velog·youtube·naver_blog_post)는 한 줄도 실행되지 않았다.**
`analysis_inputs.collected_at` 일자별 분포가 이걸 그대로 보여준다:

| 일자 | 적재된 소스 |
|---|---|
| 2026-09-21 | youtube 9,281 · clien 500 · fmkorea 323 · todayhumor 102 · damoang 48 · 82cook 37 · bobaedream 33 · danawa 20 · brunch 6 · theqoo 4 · tumblbug 1 |
| 2026-09-22 | **hackernews 3,766 · danawa 20. 끝.** |

**Relevance(45분 timeout):** 21:46:52 시작 → 대상 5 프로젝트 선정 → 3건 완료
(22:00 / 22:11 / 22:22, 프로젝트당 **약 11분** = 10배치 × 20건) → 4번째 프로젝트
`3f38dd36` 이 9배치(180건)째에서 22:32:12 에 잘림. `agent_runs.status` 가 지금도
`'running'` 이고 `finished_at` 이 null 이다 — **`tracker.finish()` 가 안 불렸다.**
그래서 이 실행의 비용·호출수 기록이 없다(아래 1-4 는 코드 기반 추정).

## 1-3. 소스별 요청 제한 (`review_sources` 실측 + 어댑터 코드)

| 소스 | enabled | min_interval | 일 상한 | 어댑터 상한 | 비고 |
|---|---|---|---|---|---|
| danawa | true | 4,000ms | 200 | 20페이지 | robots `Crawl-delay: 10` → 러너가 **10초 쪽을 택함**(`Pacer.wait` = `max(DB, robots)`) |
| hackernews | true | 2,000ms | 200 | `MAX_PAGE=20` (`paginationLimitedTo=1000`/`hitsPerPage=50`) | `incrementalOnly: true` → 영구 active. **Algolia 공식 rate limit: 리포에 미기재** |
| youtube | true | 1,000ms | 200 | 20페이지 | Data API v3 일일 쿼터: **리포에 미기재** |
| 커뮤니티 9곳(82cook·bobaedream·clien·damoang·fmkorea·theqoo·todayhumor·tumblbug·okky) | true | 3,000~4,000ms | 100 | 20페이지 | |
| brunch | true | 5,000ms | 50 | 20페이지 | robots `Crawl-delay: 5` 를 손으로 맞춘 값 |
| appstore | **false** | 2,000ms | 200 | `MAX_PAGE=11` | `disabled_reason`: robots `Disallow: /*/rss/*` 위반 — BYO 붙여넣기로 대체 |
| reddit | **false** | 1,000ms | 200 | — | 자격증명 미발급(SP-024) |
| naver_blog / naver_blog_post / naver_cafe / naver_kin | **false** | 1,000~3,000ms | 100~200 | — | 자격증명·약관·응답 실물 미확인 |

- 전 소스 health=`ok`.
- 러너는 `requests >= source.daily_request_cap - requestsToday` 면 그 소스를 끝낸다.
  `hackernews` cap 200 · 타깃 28개 중 HN 25개 × 최대 20페이지 = 이론상 500요청 → **cap 200 이
  먼저 걸린다.** 어젯밤은 cap 이 아니라 30분 timeout 이 먼저 걸렸다.
- **하루 2회 돌리면 일 상한은 늘지 않는다** — `daily_request_cap` 은 UTC 날짜 기준 누적이라
  2회차는 남은 몫만 쓴다. 즉 "수집 2회"는 요청 총량을 늘리지 않고 **순서만 한 번 더 돌려
  starve 된 뒤쪽 소스에 차례를 준다.**

## 1-4. Gemini 호출 수·비용 (실측 + 코드 기반 추정)

**실측 (`agent_runs.summary`, extract 2026-09-23 실행):**

- 3 프로젝트 · **LLM 호출 57회** · **추정 $0.3387** · 9분 59초
- 프로젝트당: 19회 · $0.113 · LLM 시간 151s / 60s / 338s (= 549초)
- 모델: `gemini-3.6-flash` 2건 → `gemini-3.5-flash` 1건 (체인 1→2번째로 **이미 밀렸다**)

**실측 (relevance, `agent_run_steps`):**

- 3 프로젝트 × 10배치 = 30호출 + 4번째 9배치 = **39호출** (비용 기록 없음 — finish 미호출)
- 모델: `gemini-3-flash-preview` 480건 · `gemini-3.5-flash-lite` 300건
  → **체인 3·4번째.** 1·2·3번째가 그 시점에 이미 소진됐다는 직접 증거다.

**단가·무료 티어 (리포에 있는 값만):**

- `lib/analysis/budget.ts`: `USD_PER_MTOK_IN=0.5` · `USD_PER_MTOK_OUT=4` — 주석이 "보수적
  추정치, 실단가는 Gemini 콘솔에서 확인해 env 로 덮어쓴다"고 명시. **실단가는 미기재.**
- 무료 티어: `lib/analysis/llm.ts:40` · `lib/analysis/angle-lock.ts:6` 에
  "**모델당 일일 한도 20건/일**(gemini-3.6-flash)". 체인 5모델 → 리포 기준 **일 100호출**.
  RPM 수치는 미기재("429 경험"만 `docs/remedy-matching-ab-2026-09-21.md`·`remedy-db.ts`).
- 유료 종량 단가: **미기재.** `docs/review-sources-and-remedy-roadmap-2026-09-21.md` 의
  "Gemini 종량제 ≈ $0.001/프로젝트"는 판정자(LLM 재랭킹) 한정 수치다.

**토큰/건 추정 (코드에서):**

- extract: `MAX_CHARS_TOTAL=120,000` → `tokensOf` = **입력 최대 60,000토큰/프로젝트**,
  출력 `ASSUMED_OUTPUT_TOKENS=1500`. `usdFor(120000,1500)` = **$0.036/호출**.
- relevance: `BATCH_SIZE=20 × MAX_REVIEW_CHARS=1500` = 최대 30,000자 = **15,000토큰/배치**.
  `usdFor(30000,1500)` = **$0.0135/배치** → 200건/프로젝트 = 10배치 = **$0.135/프로젝트**.
- 어제 밤 총 추정: extract $0.339 + relevance ≈ $0.47 (39배치) = **약 $0.81/야간**.

## 1-5. 하루 2회·3회 안의 리스크

| 리스크 | 근거 | 2회 | 3회 |
|---|---|---|---|
| **무료 티어 일일 한도 초과** | 어젯밤 1회만으로 체인 1~3번째가 소진돼 4번째까지 내려갔다 | 거의 확실히 초과 | 확실히 초과 |
| **일 $5 상한이 사실은 $5×N** | `budget.ts` 주석: 하루 상한은 **프로세스 단위**. Actions 잡 = 별 프로세스 | 최악 $10/일 | 최악 $15/일 |
| **동시 실행 충돌** | 각 워크플로 `concurrency.group` 있음 + `cancel-in-progress: false` → 겹치면 **대기**(안전). 단 Actions 지연 3h 와 겹치면 2회차가 큐에 갇힌다 | 중 | 높음 |
| **타깃 커서 덮어쓰기** | `concurrency` 로 막힘 | 낮음 | 낮음 |
| **`extract` 가 검수값을 덮음** | `status='collecting'` + `force` 없음 + `extract-gate.canStart` 가 reviewed/angled 거부 | 없음 | 없음 |
| **다나와 robots Crawl-delay 위반** | `Pacer` 가 `max(4000, 10000)` 적용 | 없음 | 없음 |

## 1-6. 개선안

**A안 — "2회차를 돌리지 말고 1회차를 끝까지 돌려라" (권고, 비용 0)**
1. `nightly-review-collect.yml` `timeout-minutes: 30 → 90`, 잡을 **소스 그룹 2~3개로 분리**
   (`matrix` 또는 `--source=` 를 나눈 별 스텝). HN 이 30분을 먹어도 나머지가 돈다.
2. `nightly-relevance.yml` `timeout-minutes: 45 → 90`, 또는 `RELEVANCE_MAX_PROJECTS 5 → 4`
   (실측 11분/프로젝트 × 4 = 44분).
3. `finish()` 를 `try/finally` 로 옮겨 timeout 때도 `agent_runs` 가 닫히게.
- 소요: **3h** (워크플로 2개 + tracker 1곳). LLM 비용 증가 0. 무료 티어 압박 증가 0.

**B안 — 수집만 하루 2회, LLM 은 1회 유지**
- collect 를 KST 02:37 + 14:37 두 슬롯. extract/relevance 는 그대로 1회.
- 효과: starve 된 13개 소스가 2회차에서 차례를 받는다. 무료 티어 소비 증가 **0**
  (collect 는 LLM 을 안 쓴다). `daily_request_cap` 은 UTC 일 단위라 총 요청량은 안 늘어난다.
- 소요: **1h** (cron 줄 1개 + 헤더 주석). A안과 병행 가능.

**C안 — LLM 파이프라인도 2회 (유료 전환 전제)**
- 전제: Gemini 종량 결제 활성화 + `LLM_USD_PER_MTOK_IN/OUT` 을 실단가로 env 설정 +
  `LLM_DAILY_BUDGET_USD` 를 계정 단위로 올리는 대신 **DB 원장 테이블 1개**로 승격
  (`budget.ts` 주석의 upgrade path — 프로세스 단위 상한은 2회 실행에서 2배가 된다).
- 소요: **6h** (원장 테이블 마이그레이션 + `reserveOrThrow`/`chargeOutput` 배선 + 셀프테스트).
  결제·실단가 확인은 사람 몫.

---

# 2. 커버리지 매트릭스 — 문제유형(pain type) × 병목(reader-problem)

## 2-0. 먼저: 두 축이 `review_targets` 에 없다 (설계 사실)

- `review_targets` 컬럼: `id, project_id, source_key, product_ref, label, cursor,
  last_review_at, status, consecutive_empty, last_run_at, total_collected, created_at`.
  **pain type 도 bottleneck 도 없다.**
- `reader_problem` 컬럼은 **`case_studies` 에만** 있다(`config/reader-problems.json` 의
  `_about` 도 그렇게 못박음). `analysis_projects` 에는 없다 — `relevance-judge.ts` 의
  `RelevancePurpose.reader_problem` 주석이 "지금 `analysis_projects` 에는 이 컬럼이 없다"고
  직접 적어 뒀다.
- `analysis_projects.bottleneck`: 38건 중 **37건 NULL**, `TRUST` 1건.
  → 병목 축으로 매트릭스를 만들 수 없다.
- **실제로 축이 되는 건 프로젝트 이름에 박힌 `[CODE]` 문자열 하나뿐이다.**
  SaaS VOC 프로젝트 7개가 `reader-problems.json` 7코드와 1:1로 붙어 있다.
  이걸 행 축으로 삼았다(문자열 파싱 = 정규 데이터 경로가 아니다. 이것도 발견 사항이다).

## 2-1. 행 축 실측 — 7코드 중 4개가 리뷰 0건

| reader_problem | project | status | 타깃(active) | inputs | aspects | relevance |
|---|---|---|---|---|---|---|
| MAKE_BUT_NO_MONEY | e819f101 | extracted | 3(3) | 1,602 | 5 | 0 |
| NO_FIRST_CUSTOMER | ee68cb68 | extracted | 3(3) | 1,401 | 5 | 0 |
| PRICE_TOO_LOW | d62f3caa | extracted | 3(3) | 518 | 5 | 0 |
| **ONE_OFF_ONLY** | fac878dc | collecting | 3(**3**) | **0** | **0** | 0 |
| **NO_CHANNEL** | f6900c17 | collecting | 3(**3**) | **0** | **0** | 0 |
| **SOLO_CEILING** | cd0a1a19 | collecting | 3(**3**) | **0** | **0** | 0 |
| **NOBODY_TRUSTS_ME** | 9fece18e | collecting | 2(**2**) | **0** | **0** | 0 |

빈 4행의 원인은 "타깃이 없다"가 **아니다.** 타깃 11개가 전부 `status='active'` 인데
`last_run_at` 이 **NULL** 이다 — 즉 **한 번도 실행된 적이 없다.** 1-2 의 30분 timeout 이
그 차례에 닿기 전에 잡을 죽였다.

```
hackernews  last_run=NEVER  collected=0  ref=q:churn saas          | ONE_OFF_ONLY
hackernews  last_run=NEVER  collected=0  ref=q:cancel subscription | ONE_OFF_ONLY
hackernews  last_run=NEVER  collected=0  ref=q:one time purchase   | ONE_OFF_ONLY
hackernews  last_run=NEVER  collected=0  ref=q:cold email          | NO_CHANNEL
hackernews  last_run=NEVER  collected=0  ref=q:marketing channel   | NO_CHANNEL
hackernews  last_run=NEVER  collected=0  ref=q:product hunt launch | NO_CHANNEL
hackernews  last_run=NEVER  collected=0  ref=q:solo founder        | SOLO_CEILING
hackernews  last_run=NEVER  collected=0  ref=q:hire first employee | SOLO_CEILING
hackernews  last_run=NEVER  collected=0  ref=q:doing everything myself | SOLO_CEILING
hackernews  last_run=NEVER  collected=0  ref=q:social proof        | NOBODY_TRUSTS_ME
hackernews  last_run=NEVER  collected=0  ref=q:customer testimonials | NOBODY_TRUSTS_ME
+ q:Plausible Analytics / q:Carrd / q:ConvertKit (발굴 SaaS 3건, 역시 NEVER)
```

`listDueTargets` 는 `order('last_run_at', nullsFirst: true)` 라 **NULL 이 맨 앞**이다.
따라서 다음 collect 실행이 HN 차례에 닿기만 하면 이 11개가 가장 먼저 잡힌다 —
필요한 건 타깃 추가가 아니라 **실행 시간**이다.

## 2-2. 셀 매트릭스 — SaaS 3행 × 페인 16유형 (리뷰 건수)

`raw_text` 에 그 유형의 낱말이 1개 이상 등장하는 `analysis_inputs` 수.

| reader_problem | 가격·가성비 | 연동·데이터이동 | 구독·해지·이탈 | 무료체험·유료전환 | 온보딩 | 향·냄새 | **요금제·과금** | **좌석·권한·협업** | **안정성·응대** | **도입·계약·보안심사** | 소비재 6유형 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MAKE_BUT_NO_MONEY | 97 | 232 | 27 | 33 | 4 | 3 | **0** | **0** | **0** | **0** | 0 |
| NO_FIRST_CUSTOMER | 150 | 223 | 30 | 41 | 12 | 5 | **0** | **0** | **0** | **0** | 0 |
| PRICE_TOO_LOW | 112 | 106 | 4 | 17 | 10 | 0 | **0** | **0** | **0** | **0** | 0 |
| ONE_OFF_ONLY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| NO_CHANNEL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| SOLO_CEILING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| NOBODY_TRUSTS_ME | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| (미지정 = 소비재 프로젝트 31건) | 910 | 37 | 366 | 70 | 16 | 99 | 2 | 5 | 64 | 59 | 효능77·세정73·사용감118·자극153·용기103·제형149 |

**빈 셀 = 7×16 격자 중 SaaS 축 4행 전체(64칸) + 채워진 3행의 SaaS 4유형(12칸) + 소비재 6유형(18칸) = 94/112칸.**

**채워진 3행에서도 비어 있는 SaaS 유형 4개**: `요금제·과금`, `좌석·권한·협업`,
`안정성·응대`, `도입·계약·보안심사`. 현재 HN 질의(`side project revenue`,
`make money saas`, `first paying customer`, `pricing page` 등)가 **획득·수익화 언어**라
운영·조직·엔터프라이즈 언어를 안 긁는다.

## 2-3. 페인 낱말 자체가 거의 안 걸린다

**`analysis_inputs` 16,229건 중 13,291건(81.9%)이 페인 유형 16종 어느 것도 안 맞춘다.**

| source_key | inputs | 평균 길이 | 페인 0히트 비율 |
|---|---|---|---|
| youtube | 9,281 | 96자 | **86%** |
| hackernews | 3,766 | 1,559자 | **74%** |
| danawa | 2,116 | 51자 | 78% |
| clien | 500 | 89자 | 83% |
| fmkorea | 323 | 50자 | 84% |
| todayhumor | 102 | 63자 | 81% |
| damoang | 48 | 93자 | 63% |
| 82cook | 37 | 178자 | 70% |
| bobaedream | 33 | 61자 | 94% |
| brunch | 6 | 2,429자 | 0% |
| theqoo | 4 | 513자 | 25% |

HN 74%: 낱말 사전이 한국어 위주다(`api`·`onboarding`·`trial`·`churn`·`retention`·
`integration`·`price`·`scent` 만 영문). 영어 코퍼스에 한국어 사전을 대고 있다.

## 2-4. 빈 셀을 채울 타깃 후보 — **소스 종류만** (URL 추측 없음)

| 빈 축 | 후보 소스 종류 | 리포 상태 |
|---|---|---|
| ONE_OFF_ONLY / NO_CHANNEL / SOLO_CEILING / NOBODY_TRUSTS_ME | **이미 등록된 HN 질의 11개** | 어댑터·타깃 전부 준비됨. **실행만 필요** |
| 요금제·과금 · 좌석·권한·협업 | HN 질의 신규(운영·과금 언어) + `okky`(활성·타깃 0건) | okky enabled=true, **타깃 0개** |
| 안정성·응대 | HN 질의 신규 + `velog`(활성·타깃 0건) | velog enabled=true, **타깃 0개** |
| 도입·계약·보안심사 | Reddit(r/SaaS·r/msp 류) | **enabled=false, 자격증명 미발급** |
| SaaS 앱 리뷰 축 전반 | App Store / G2·Capterra 류 | appstore **robots 위반으로 영구 비활성**, BYO 붙여넣기 경로가 대체안 |

`okky`·`velog` 는 `review_sources.enabled=true` 인데 **`review_targets` 가 0개**다 —
활성화만 하고 타깃을 안 등록했다(`review-collect` 소스 목록에는 들어 있다).

## 2-5. 개선안

**A안 — 페인 낱말 영문 보강 (LLM 0원, 가장 싼 한 방)**
- `config/pain-terms.json` 16유형에 영문 낱말 추가(SaaS 8유형 우선: `churn`·`onboarding`·
  `seat`·`sso`·`downtime`·`invoice`·`quota`·`migration`·`export`·`webhook` 등).
  `scripts/pain-terms-selftest.mjs` 가 STOPWORDS·2자 규칙을 검사한다.
- 효과: HN 74% 0히트가 즉시 줄어 T1 선별 점수가 SaaS 텍스트를 위로 올린다. 비용 0.
- 소요: **2h** (사전 편집 + 셀프테스트 + 0히트율 재측정).

**B안 — 빈 4행을 채우는 건 신규 타깃이 아니라 collect 실행 시간**
- 1-6 A안/B안과 같은 조치. 이미 등록된 11개 타깃이 `nullsFirst` 로 최우선이다.
- 소요: **0h 추가** (1-6 과 동일 작업).

**C안 — okky·velog 타깃 등록 + HN 운영언어 질의 추가**
- 사람이 질의·게시판을 정해야 한다(자율 등록은 §10.1 밖). 코드 변경 0, DB INSERT 만.
- 소요: **1h** (질의 확정 후 등록 스크립트 실행) + 질의 선정은 사람 판단.

---

# 3. 소진(exhausted) 타깃 자동 재활성화

## 3-1. `runner.ts` endStatus 분기 (코드 실측)

```
lib/review/runner.ts:391  const endStatus = adapter.incrementalOnly ? 'active' : 'exhausted'
```

| 종료 사유 | 줄 | 기록되는 status |
|---|---|---|
| `nextRequest()` 가 null (질의 형식 불량 / 페이지 상한) | 446 | **exhausted** |
| robots 금지 · robots 확인 불가(fail-closed) | 429 | **exhausted** |
| 커서 null = 끝까지 읽음 | 512·523 | `incrementalOnly` ? active : **exhausted** |
| 403/429 (차단 또는 쿼터) | 470 | active (+ `aborted=true`) |
| `status === null` 또는 >= 400 | 477 | **failed** |
| STALE 연속 도달 | 528 | active |
| 일일 상한 도달 | 401·397 | 진입 전 스킵 (status 유지) |

**그리고 소비하는 쪽:**

```
lib/review/store.ts:69   .eq('status', 'active')
```

`listDueTargets` 는 **`active` 만** 집는다. **`exhausted`·`failed` 를 다시 `active` 로
되돌리는 코드는 리포 어디에도 없다.** (`saveTargetProgress` 가 쓰는 status 는 항상
그 실행에서 계산된 값이고, exhausted 타깃은 애초에 실행 대상이 아니다.)

## 3-2. 현재 상태별 타깃 수 (113건 전건)

| status | 수 | 비율 |
|---|---|---|
| **exhausted** | **85** | **75.2%** |
| active | 28 | 24.8% |
| failed | 0 | 0% |

| source_key | exhausted | active |
|---|---|---|
| clien | 19 | 0 |
| youtube | 18 | 1 |
| danawa | 15 | 2 |
| 82cook | 7 | 0 |
| brunch | 7 | 0 |
| fmkorea | 5 | 0 |
| theqoo | 4 | 0 |
| bobaedream | 3 | 0 |
| damoang | 3 | 0 |
| todayhumor | 3 | 0 |
| tumblbug | 1 | 0 |
| **hackernews** | **0** | **25** |

- `hackernews` 만 `incrementalOnly: true` 라 영구 active. **다른 11개 소스는 전부 사실상 폐쇄.**
- exhausted 85건 중 `consecutive_empty` 가 0 인 것이 **80건** — 즉 "성과가 없어서"가 아니라
  **"끝까지 읽었으니까"** 닫혔다. 예: clien `유산균 고르는법` 74건 수집 후 exhausted,
  youtube `빅퀘스천` 1,536건 수집 후 exhausted.
- `consecutive_empty >= 1` 은 6건뿐(brunch 1 · danawa 5).
- `cursor` 는 exhausted 85건 **전부 null** → 재활성화하면 page 0 부터 다시 읽는다.
  지문 중복(`ingestPage`)이 있어 재적재는 안 되지만, **20페이지를 다시 훑는 요청 비용은
  그대로 든다.**
- `last_run_at`: exhausted 85건 중 70건이 **2026-09-21**, 나머지는 09-02~09-20.
  즉 **커뮤니티 소스는 09-21 하루 돌고 전부 닫혔다.**

## 3-3. 개선안

**A안 — 커뮤니티 소스를 `incrementalOnly: true` 로 (가장 작은 진짜 수정)**
- 게시판 검색 질의는 HN 질의와 **성질이 같다** — 고갈되지 않고 매일 새 글이 달린다.
  `product_ref` 가 `q:`/검색어인 어댑터(82cook·bobaedream·clien·damoang·fmkorea·
  theqoo·todayhumor·brunch·okky·velog·tumblbug)에 플래그 1줄.
  `pcode`/앱ID 로 특정 상품을 가리키는 danawa·appstore 는 **건드리지 않는다**(진짜 고갈).
- 이미 exhausted 인 82건은 **1회성 UPDATE** 로 active 복구 필요(DB 쓰기 = 사람 판단).
- 리스크: 매 실행 page 0 부터 20페이지를 다시 훑는다. `STALE_STREAK_TO_STOP` 이
  조기 종료시키지만(danawa 실측 "이미 본 구간 도달(연속 10건)" = 1요청에 종료),
  검색 결과 정렬이 최신순이 아닌 게시판은 20페이지를 다 훑을 수 있다.
- 소요: **4h** (어댑터 플래그 11개 + `review-runner-selftest.mjs` 보강 + `--dry` 로
  요청 수 실측). + 82건 UPDATE 는 사람 승인.

**B안 — 재활성화 잡을 따로 둔다 (기존 구조 안 건드림)**
- 조건: `status='exhausted'` AND `consecutive_empty < 3` AND `last_run_at < now() - 7일`
  → `status='active'`, `cursor=null` 유지. 주기: 주 1회(collect 직전 슬롯).
- 장점: 어댑터 의미론을 안 바꾼다. `consecutive_empty` 3연속이면 진짜로 닫아 둔다.
- 단점: 잡 1개 + 워크플로 1개 추가. 주 1회면 커뮤니티 신선도가 최대 7일 뒤처진다.
- 소요: **5h** (스크립트 + 워크플로 + 셀프테스트 + dry-run 판정).

**C안 — 아무것도 안 한다 (현 상태 = 커뮤니티 소스 폐쇄 유지)**
- SaaS 피봇이라 한국 소비재 커뮤니티 82건은 가치가 낮다는 판단이면 이게 맞다.
  단 `okky`·`velog`(개발자 커뮤니티 = SaaS 축)는 타깃 0개라 이 판단과 무관하게 손대야 한다.
- 소요: 0h.

---

# 4. extract 미실행 프로젝트

## 4-1. 어제 3건만 뽑힌 이유 = **상한이다. 필터가 아니다.** (`agent_run_steps` 원문)

```
21:36  select | ok | {"candidates":27,"eligible":13,"targets":3,"remaining":10,"unknown":0}
                   | {"min_new":100,"max_projects":3}
21:39  extract-e819f101 | ok | {"inputs":97, "aspects":5, "dropped":903} | 151초 gemini-3.6-flash
21:40  extract-ee68cb68 | ok | {"inputs":88, "aspects":5, "dropped":912} |  60초 gemini-3.6-flash
21:45  extract-d62f3caa | ok | {"inputs":137,"aspects":5, "dropped":381} | 338초 gemini-3.5-flash
```

- 후보 27 → **기준(신규≥100) 통과 13** → `EXTRACT_AUTO_MAX_PROJECTS=3` 으로 3건 실행,
  **10건이 남았다.** `describePick` 이 정확히 이 문장을 로그에 남겼다.
- `compareAutoPriority` 는 **정상 작동했다** — SaaS 3건이 소비재(SONY 3,272 등)를 앞질렀다.
  `saasRank` → `newInputs desc` → `projectId` 순서 그대로.

## 4-2. 더 큰 구조 문제 — extract 는 프로젝트당 **평생 1회**다

- `runExtraction` 성공 시 `analysis_projects.status = 'extracted'` (`extract-run.ts:425`).
- `extract-auto.mjs` 후보는 `.eq('status','collecting')` 이고 **`force` 를 쓰지 않는다.**
- `extract-gate.canStart`: `extracted` 는 `force` 없이는 거부.

→ **어제 추출된 SaaS 3건은 야간 루프에서 영구히 빠졌다.** 그 사이 리뷰는 계속 쌓인다:

| project | extract 시점 입력(로그) | 지금 입력 | 증가 | 지금 status |
|---|---|---|---|---|
| e819f101 MAKE_BUT_NO_MONEY | 1,000 | 1,602 | +602 | extracted |
| ee68cb68 NO_FIRST_CUSTOMER | 1,000 | 1,401 | +401 | extracted |
| d62f3caa PRICE_TOO_LOW | 518 | 518 | 0 | extracted |

`status='extracted'` 는 relevance-judge 후보(`collecting`)에서도 빠진다 →
**SaaS 프로젝트의 relevance 판정은 앞으로도 0건이다** (5-1 참조).

## 4-3. 진짜 상한은 `MAX_CHARS_TOTAL` 이다 — 코퍼스의 1.7%만 읽는다

`analysis_inputs` 전체 = **6,969,996자** (≈3,485,000토큰).
`extract-select.ts` `MAX_CHARS_TOTAL = 120,000` → **한 번의 extract 가 읽는 최대치는 1.7%.**

| project | inputs | 총 글자수 | 120k 커버리지 |
|---|---|---|---|
| ee68cb68 NO_FIRST_CUSTOMER | 1,401 | 2,850,811 | **4%** |
| e819f101 MAKE_BUT_NO_MONEY | 1,602 | 2,361,396 | **5%** |
| d62f3caa PRICE_TOO_LOW | 518 | 468,923 | 26% |
| 659642c8 SONY | 3,272 | 432,727 | 28% |
| 4fcea3ff CJ웰케어 | 2,795 | 206,344 | 58% |
| 55d574a2 QCY | 1,920 | 133,525 | 90% |
| 40512422 Baremetrics | 205 | 128,825 | 93% |
| 21d49135 코웨이 | 1,349 | 104,046 | 100% |

"입력 12,443 → 속성 40" 의 원인은 T1 정렬 편향만이 아니었다. **총량 상한 × 평생 1회**가
남은 절반이다. HN(평균 1,559자)이 주 소스인 SaaS 프로젝트에서 이 상한이 가장 아프게 걸린다.

## 4-4. `analysis_inputs` 있는데 `analysis_aspects` 없는 프로젝트 = **16건**

| status | bm | inputs | p50 길이 | max 길이 | label |
|---|---|---|---|---|---|
| collecting | - | 3,272 | 98 | 1,403 | SONY WF-1000XM5 |
| collecting | - | 1,920 | 55 | 1,402 | QCY MeloBuds Pro HT08 |
| collecting | - | 1,349 | 54 | 1,024 | 코웨이 정수기 |
| collecting | - | 779 | 38 | 3,661 | TS 올뉴 플러스 샴푸 |
| collecting | - | 685 | 50 | 292 | 오랄비 전동칫솔 |
| collecting | - | 509 | 57 | 590 | 바디프랜드 파라오 |
| collecting | - | 439 | 54 | 416 | 라보에이치 샴푸 |
| collecting | - | 240 | 53 | 401 | 락토핏 |
| **collecting** | **SAAS** | **205** | **441** | **5,480** | **Baremetrics** |
| collecting | - | 127 | 69 | 232 | 닥터포헤어 폴리젠 |
| collecting | - | 93 | 52 | 482 | 필립스 에어프라이어 |
| collecting | - | 92 | 29 | 176 | 려 자양윤모 |
| **failed** | - | **75** | 67 | 886 | **스토케 익스플로리 유모차** |
| collecting | - | 73 | 74 | 82 | 비에날씬 BNR17 |
| **collecting** | **SAAS** | **40** | **1,250** | **3,544** | **Help Scout** |
| collecting | - | 3 | 4 | 5 | 유한양행 엘레나 |

**raw_text 길이 분포 (전체 16,229건):**

| 구간 | 건수 | 비율 | T1 효과 |
|---|---|---|---|
| **0~79자** | **8,252** | **50.8%** | `lengthFactor = 0.5` (감산) |
| 80~2,000자 | 7,072 | 43.6% | `= 1.0` (밴드 안) |
| 2,001~8,000자 | 882 | 5.4% | `= 0.5` + 8,000자에서 절단 |
| 8,001자+ | 23 | 0.1% | `= 0.5` + 절단 |

p10=32 · p25=46 · **p50=78** · p75=265 · p90=1,298 · p99=4,530 · max=27,056.
**중위값이 78자로 `LENGTH_MIN=80` 바로 아래다** — 코퍼스 절반이 길이 감산을 맞는다.
YouTube 9,281건(평균 96자)·danawa 2,116건(평균 51자)이 원인이다.

**business_model:** 38 프로젝트 중 SAAS 12 · MARKETPLACE_SELLER 1 · **NULL 25**.
extract 미실행 16건 중 SaaS 는 Baremetrics·Help Scout 2건뿐이고 나머지 14건은 NULL(=소비재).

**오늘 밤(09-23) extract 가 뽑을 3건 (시뮬레이션):**
`Baremetrics(SaaS 205)` → `SONY(3,272)` → `QCY(1,920)`.
eligible 10 · 남는 7. **SaaS eligible 은 1건뿐**이므로 예산의 2/3이 소비재로 간다.
SaaS 우선 정렬은 맞지만 **SaaS 재고 자체가 없다.**

## 4-5. 개선안

**A안 — `extracted` 를 다시 태운다 (신규 누적 기준으로 재추출)**
- `extract-auto.mjs` 후보를 `.in('status',['collecting','extracted'])` 로 넓히고,
  `extracted` 인 경우 `force: true` 로 `claimExtraction`.
  기존 `extract_finished_at` 기준 신규 ≥ `EXTRACT_AUTO_MIN_NEW` 조건이 이미 재추출 주기를
  자동으로 조절한다(e819f101 은 +602 라 즉시 대상, d62f3caa 는 +0 이라 제외).
- ⚠️ `force` 는 기존 aspects 를 delete→insert 한다. `human_confirmed` 가 찍힌 속성이
  날아간다. **현재 55개 속성 중 `human_confirmed` 실측 필요** → `reviewed/angled/done` 은
  `extract-gate` 가 이미 막으므로 `extracted` 상태에만 한정하면 검수 전 값만 갈린다.
- 소요: **3h** (후보 쿼리 + force 분기 + `extract-auto` 셀프테스트 + dry-run 확인).

**B안 — 상한 3개를 올린다 (가장 짧은 diff, 비용 선형 증가)**
- `EXTRACT_AUTO_MAX_PROJECTS 3 → 6` (repo variable, 코드 변경 0). 실측 183초/프로젝트 →
  6건 = 18분, `timeout-minutes: 45` 안. 추정 비용 $0.34 → $0.68.
- `MAX_CHARS_TOTAL 120,000 → 240,000`: 커버리지 1.7%→3.4%. 입력 토큰 2배 =
  호출당 $0.036→$0.066. `REQUEST_BUDGET_USD=0.5` 에 아직 여유.
- ⚠️ 둘 다 무료 티어를 더 태운다 — 1-6 C안(유료 전환) 없이는 체인 5모델이 더 빨리 마른다.
- 소요: **1h** (variable 2개 + `MAX_CHARS_TOTAL` 1줄 + 셀프테스트 기대값).

**C안 — 짧은 리뷰를 묶어서 넣는다 (상한을 안 올리고 커버리지를 늘림)**
- 50.8%가 80자 미만이다. `selectInputs` 가 이걸 1건=1블록으로 넣으면 헤더·구분자
  오버헤드가 본문보다 크다. 같은 `source_key`+프로젝트의 짧은 리뷰 N건을 한 블록으로
  이어 붙이면 같은 120k 안에 **2~3배 건수**가 들어간다.
- 대가: 인용 귀속(`evidence_quotes`)이 블록↔원문 1:1 이 아니게 된다. `input_id` 매핑을
  같이 들고 가야 한다.
- 소요: **6h** (선별기 개조 + `evidence-quotes.ts` 귀속 + 셀프테스트).

---

# 5. T2 정밀도

## 5-1. 분포·일치율 실측

| 항목 | 실측 |
|---|---|
| `review_relevance_verdicts` 총 | **780행** |
| verdict | relevant **540 (69.2%)** · irrelevant **195 (25.0%)** · unknown **45 (5.8%)** |
| **`human_verdict` NOT NULL** | **0행** |
| → **LLM↔사람 일치율** | **실측 불가: 사람 채점 행이 0건이다** (T3 가 한 번도 안 돌았다) |
| few-shot 예시 수 | `agent_run_steps` 3건 전부 `{"examples":0}` — 예시 없이 판정했다 |
| `judged_at` | 780건 전부 **2026-09-22** (하루치) |
| model | `gemini-3-flash-preview` 480 · `gemini-3.5-flash-lite` 300 |
| reason 채움 | irrelevant **195/195 (100%)** · unknown **25/45 (56%)** |
| 대상 프로젝트 | 4건 — 라보에이치 180 · 오랄비 200 · 바디프랜드 200 · 코웨이 200 |
| **SaaS 프로젝트 판정** | **0건.** SaaS 7건 중 3건은 `extracted`(후보 밖), 4건은 inputs 0 |

**즉 T2 는 지금까지 소비재만 채점했다.** 피봇 방향인 SaaS 정밀도는 **실측 불가**다.

## 5-2. 무관 195건 — reason 패턴

`reason` 전건 문자열 빈도:

| 키워드 | 건수 |
|---|---|
| `제품` | 89 |
| `무관` | 22 |
| `잡담` | 16 |
| `감탄` | 14 |
| `광고` | 8 |
| `내용이 없` | 3 |
| `다른 제품` / `다른 주제` | 2 / 2 |

**결정적 표본 10건** (195건을 19번째마다 뽑음 — seed 없이 재현 가능):

1. `[youtube]` 123자 · `제품 판매를 위한 단순 광고성 링크임`
   → "탈모와 민감한 두피로 고민인 분들은 데일리 샴푸로 써보세요^^ smartstore.naver.com/..." **(맞다)**
2. `[youtube]` 56자 · `티비 관련 댓글` → "잇섭님 티비 바꾸신거같은데 사용기 올라오나용?" **(맞다)**
3. `[youtube]` 168자 · `다른 브랜드 제품 사용 후기임` → 닥터포헤어 8년 사용기 **(경쟁 분석엔 오히려 재료다 — 의심)**
4. `[youtube]` 106자 · `탈모로 인한 고충과 영상 시청 소감으로 제품 리뷰가 아님`
   → "탈모때문에 매일같이 모자쓰고... 우울증걸릴거같아서 하루하루 힘드네요" **(VOC 페인 발굴 목적에는 1급 재료다 — 오판)**
5. `[danawa]` 27자 · `가격 대비 만족한다는 한 줄 평으로 구체적 맥락 부족` → "가격대비만족" ×4 **(맞다)**
6. `[youtube]` 195자 · `안마의자가 아닌 중국산 리클라이너 구매 후기임` **(대체재 신호 — 의심)**
7. `[youtube]` 166자 · `반려견 관련 잡담` **(맞다)**
8. `[youtube]` 84자 · `유튜버 방 인테리어 언급` **(맞다)**
9. `[youtube]` 65자 · `타제품 닥터포헤어 사용감 리뷰` **(경쟁 분석 재료 — 의심)**
10. `[youtube]` 53자 · `출연자 의상 언급` **(맞다)**

**패턴 진단: 10건 중 6건은 명확히 맞고, 4건은 "타 제품·페인 토로"를 버렸다.**
원인은 프롬프트가 아니라 **목적 문장이다.** `describePurpose` 는
`reader_problem` → `product_elevator_pitch` → `purpose` 순으로 떨어지는데,
4개 프로젝트의 `product_elevator_pitch` 가 `"코웨이 정수기"`, `"오랄비 전동칫솔"`,
`"탈모샴푸 경쟁 분석 (라보에이치 두피강화 샴푸 700ml)"` 같은 **제품 이름**이다.
목적이 "이 제품"이면 모델은 "이 제품 리뷰인가?"로 읽고, 경쟁사 후기와 페인 토로를 버린다.
`analysis_projects` 에 `reader_problem` 컬럼이 없다는 2-0 의 사실이 여기서 비용으로 나온다.

## 5-3. 사전필터 후보 검증 — **페인 낱말 필터는 역효과다**

| verdict | n | 페인 0히트 | <80자 |
|---|---|---|---|
| relevant | 540 | **55%** | 24% |
| irrelevant | 195 | **44%** | **41%** |
| unknown | 45 | 40% | 31% |

- **페인 히트가 없는 쪽이 오히려 relevant 비율이 높다** (relevant 55% vs irrelevant 44%).
  페인 낱말로 사전 필터하면 relevant 를 더 많이 버린다. **기각.**
- 길이는 약하게 유용: `<80자` 를 버리면 irrelevant 79건 제거 대가로 relevant 130건을 버린다
  (1:1.6). **단독 필터로는 부적합**, T1 감산(현행 0.5배)이 이미 적절한 수준이다.

## 5-4. 개선안

**A안 — 목적 문장을 고친다 (프롬프트 0줄 수정, 가장 큰 효과)**
- `analysis_projects` 에 `reader_problem` 컬럼 추가(NULL 허용, CHECK `^[A-Z][A-Z_]*$`)
  → `describePurpose` 1순위 분기가 **이미 구현돼 있다**. 컬럼만 생기면 코드 변경 0.
- 또는 컬럼 없이: 프로젝트별 `purpose` 에 "이 제품이 아니라 이 병목의 재료를 찾는다"를
  사람이 한 줄 써 넣는다(DB UPDATE 만, 스키마 변경 0).
- 소요: 컬럼 안 = **3h** (마이그레이션 + 백필 판단 + `case-pipeline-verify` 어휘 대조).
  `purpose` 한 줄 안 = **0.5h** + 문장은 사람이 씀.

**B안 — T3 사람 채점 1회 (일치율 실측 + few-shot 점화)**
- `pickGradingSample(rows, {n:10, seed:42})`·`parseGradingMarkdown` 이 **이미 구현돼 있다**
  (관련 5 : 무관 5 균형 표본, 재현 가능 난수). `human_verdict` 10건이 들어가면
  다음 배치부터 `examplesFor` 가 few-shot 10건을 프롬프트에 넣는다.
- 지금 `examples:0` 이라 T3→T2 되먹임 경로가 **한 번도 켜진 적이 없다.**
- 소요: **2h** (채점표 생성 CLI 확인 + 저장 경로 검증). 채점 10건은 사람 30분.

**C안 — 표본을 프로젝트당 200 → 100 으로 줄이고 프로젝트 수를 늘린다**
- 실측 11분/프로젝트(10배치). 100건이면 ~6분 → 45분 안에 7 프로젝트.
  판정 신뢰구간은 ±10%p → ±14%p 로 나빠지지만, **SaaS 프로젝트에 첫 판정이 붙는다**는
  게 더 크다(현재 SaaS 판정 0건).
- `RELEVANCE_SAMPLE` repo variable 1개. 코드 변경 0.
- 소요: **0.5h**. 단 후보가 `collecting` 뿐이라 4-5 A안 없이는 SaaS 3건이 여전히 안 들어온다.

**D안 — 무관 판정을 실제로 쓰고 있는지 확인** (숨은 문제)
- `dropIrrelevant` 는 `extract-run.ts` 가 부르는데, 어제 extract 3건 로그의
  `"irrelevant":0` 이다. 판정된 4 프로젝트가 extract 대상 3건과 **겹치지 않아서** 다.
  즉 195건의 무관 판정이 아직 아무것도 제외한 적이 없다.
- 소요: 0h (관측 사실. 4-5 A안/C안이 해결).

---

# 6. 검수 큐 가치순 정렬

## 6-1. 현재 정렬 로직 (코드 실측)

**`/cases/grade` — `lib/cases/grade-queue.ts:sortGradeQueue`**

```
SAAS 먼저 (business_model === 'SAAS' ? 0 : 1)
→ 승인 무브가 적은 병목 먼저 (approvedMovesByBottleneck)
→ created_at 오래된 것 먼저
→ id
```
한 페이지 `GRADE_PAGE_SIZE = 10`. 기회점수·근거등급·reader_problem 은 **안 쓴다.**

**`/analyze` — `app/analyze/page.tsx`**

```
기본: .order('created_at', { ascending: false })   — 최근 생성 순
?sort=demand: axesOf(r).demand.value 내림차순, value=null 은 뒤로
```
칩 2개(`최근 생성 순` / `수요축 높은 순`). `LIMIT` 안에서 전건을 읽어 서버에서 정렬.

## 6-2. 현재 큐 실측

| 항목 | 실측 |
|---|---|
| `case_studies` | 53건 — approved 22 · rejected 22 · **draft 9** |
| `case_moves` | 106건 — approved 41 · rejected 48 · draft 17 |
| **draft 큐 = 9건 → 1페이지에 다 들어간다** | 페이지네이션이 지금은 무의미 |
| draft business_model | D2C 5 · SUBSCRIPTION 2 · **SAAS 1** · SERVICE 1 |
| draft bottleneck | UNIT_ECONOMICS 4 · RETENTION 2 · SUPPLY 2 · TRUST 1 |
| draft reader_problem | MAKE_BUT_NO_MONEY 4 · ONE_OFF_ONLY 2 · PRICE_TOO_LOW 1 · NOBODY_TRUSTS_ME 1 · SOLO_CEILING 1 |
| draft 생성일 | 2026-09-16 ~ 2026-09-21 |
| 승인 무브 재고(2순위 키) | TRUST 9 · RETENTION 8 · CONVERSION 8 · AWARENESS 6 · SUPPLY 6 · DISTRIBUTION 4 · **UNIT_ECONOMICS 0** |

**2순위 키가 이미 옳게 작동한다:** `UNIT_ECONOMICS` 재고 0이고 draft 4건이 그 병목이라
SAAS 1건 다음으로 UNIT_ECONOMICS 4건이 앞에 선다.

**정렬로 얻을 게 지금은 없다 — 큐가 9건이다.** 하루 10장 상한(`GRADE_PAGE_SIZE`)보다 작다.
병목은 **정렬이 아니라 공급**이다: draft 9건 중 SaaS 1건, `case_studies.reader_problem`
53건 중 21건 NULL.

**`/analyze` 쪽은 다르다:** 프로젝트 38건, `기회점수`(`analysis_aspects.opportunity_score`)
범위 **3~17**, 55개 속성. quadrant 는 `DIFFERENTIATOR` 12 · `TABLE_STAKES` 10 ·
`IGNORE` 9 · `OVER_INVESTED` 4 · **NULL 20**. 즉 기회점수 정렬 키의 재료는 있다.

## 6-3. 후보 정렬 키 평가

| 키 | 재료 유무 | draft 9건에서 차별력 | 판정 |
|---|---|---|---|
| SaaS 우선 | `business_model` 채워짐(9/9) | SAAS 1건 → 1등 하나 고정 | **이미 있음** |
| 병목 재고 적은 순 | `bottleneck` 채워짐(9/9) | UNIT_ECONOMICS 4건 상승 | **이미 있음** |
| 미채점 우선 | `review_status='draft'` 필터가 곧 그것 | — | **이미 있음** |
| 최신 우선 | `created_at` | 현재는 **오래된 것 먼저**(반대) | 방향 전환만 |
| **기회점수** | `analysis_aspects.opportunity_score` (3~17) | **`case_studies` 에는 이 컬럼이 없다.** 케이스↔속성 조인 경로 없음 | **`/cases/grade` 엔 적용 불가** |
| **reader_problem 재고 적은 순** | `case_studies.reader_problem` (21/53 NULL) | draft 9건이 5코드에 흩어짐 | 유효 후보 |
| 근거등급(`fact_check_grade`) | 존재(메모리 CG-1) | 미측정 | 후보 |

## 6-4. 개선안

**A안 — 아무것도 안 한다 (권고)**
- 큐 9건 < 하루 10장. 정렬을 어떻게 바꿔도 사람이 보는 집합은 같다.
  기회점수는 `case_studies` 에 컬럼이 없어 조인 경로를 새로 만들어야 하는데
  얻는 게 0이다. 큐가 30건을 넘으면 다시 본다.
- 소요: 0h.

**B안 — 2순위 키를 `bottleneck` → `reader_problem` 으로 (한 줄)**
- 매칭 1순위축이 `bottleneck` 이지만 독자 진입축은 `reader_problem` 이다(메모리
  "조사 1순위축 = 독자 이식성"). `approvedMovesByBottleneck` 의 키만 바꾸면 된다.
- ⚠️ `reader_problem` 이 53건 중 21건 NULL → NULL 이 한 덩어리로 묶여 재고 0처럼 보인다.
  `bottleneck` 을 3순위로 남겨야 한다.
- 소요: **2h** (`grade-queue.ts` 키 1개 + `cases-grade-selftest.mjs` 기대값 + NULL 처리).

**C안 — `/analyze` 에 기회점수 정렬 칩 추가 (여기가 정렬 가치가 있는 곳)**
- 이미 `analysis_aspects(opportunity_score)` 를 select 하고 있고 `수요축` 칩 패턴이 있다.
  `?sort=opportunity` 칩 1개 = 프로젝트 최대 기회점수 내림차순.
- 38 프로젝트 · 점수 3~17 → 실제 차별력이 있다.
- 소요: **2h** (칩 1개 + 정렬 함수 + null 뒤로 보내기).

---

# 질문·선택지 (남헌 결정)

### Q1. 오늘 밤 파이프라인을 "끝까지 돌게" 만들 것인가
어젯밤 collect 는 30분에, relevance 는 45분에 **잘렸다.** 그 결과 13개 소스와
빈 4개 reader_problem 축이 한 줄도 수집되지 않았다.
- **(a) timeout 만 늘린다** — collect 30→90분, relevance 45→90분. 1시간 작업. LLM 비용 증가 0. **권고**
- (b) collect 를 소스 그룹 2~3개 잡으로 쪼갠다 — 3시간. 한 소스가 죽어도 나머지 보장
- (c) 그대로 둔다 — HN 만 계속 수집

### Q2. 파이프라인 하루 2회, 어느 범위까지
- **(a) collect 만 2회** (KST 02:37 + 14:37). LLM 비용·무료 티어 소비 증가 **0**,
  `daily_request_cap` 이 UTC 일 단위라 총 요청량도 안 늘어난다. 1시간 작업. **권고**
- (b) 전체(collect+extract+relevance) 2회 — 무료 티어를 확실히 초과한다.
  어젯밤 **1회만으로도** 모델 체인 1~3번째가 소진돼 4번째로 내려갔다(실측).
  Gemini 유료 결제 + 계정 단위 예산 원장(6시간) 선행 필요
- (c) 1회 유지

### Q3. exhausted 타깃 82건(커뮤니티)을 되살릴 것인가
현재 113개 중 **85개(75%)가 exhausted** 이고 `listDueTargets` 는 `active` 만 본다.
80개는 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔다. 되살리는 코드는 리포에 없다.
- (a) 커뮤니티 어댑터 11개를 `incrementalOnly: true` 로 + 82건 1회성 UPDATE — 4시간 + DB 쓰기 승인
- (b) 주 1회 재활성화 잡 (조건: empty<3 AND 7일 경과) — 5시간
- **(c) 안 되살린다** — SaaS 피봇이라 한국 소비재 커뮤니티 82건은 가치 낮음.
  단 `okky`·`velog`(개발자 커뮤니티, enabled=true인데 **타깃 0개**)는 별건으로 등록 필요

### Q4. extract 를 프로젝트당 2회 이상 돌릴 것인가
지금은 성공하면 `status='extracted'` 가 되어 **평생 1회**다. 어제 추출된 SaaS 3건은
그 뒤로 +602·+401건이 들어왔는데 다시 안 돈다. relevance 후보(`collecting`)에서도 빠져
**SaaS relevance 판정은 앞으로도 0건**이다.
- (a) `extracted` + 신규≥100 이면 `force` 재추출 — 3시간. `human_confirmed` 속성이
  delete→insert 로 날아갈 수 있다(검수 전 단계만 대상이라 실제 위험은 낮음)
- (b) `EXTRACT_AUTO_MAX_PROJECTS 3→6` + `MAX_CHARS_TOTAL 120k→240k` — 1시간.
  커버리지 1.7%→3.4%, 비용 $0.34→약 $0.68/야간. 무료 티어 압박 증가
- (c) 짧은 리뷰(코퍼스의 50.8%가 80자 미만)를 묶어 넣어 같은 상한에 2~3배 담는다 — 6시간
- (d) 그대로

### Q5. T2 판정 기준을 "제품"에서 "병목"으로 바꿀 것인가
무관 195건 표본 10건 중 4건이 **타 제품 후기·페인 토로**를 버렸다
(예: "탈모때문에 모자쓰고 다니는데 우울증걸릴거같아서" → 무관). 원인은 프롬프트가 아니라
목적 문장이다 — `describePurpose` 가 `product_elevator_pitch`("코웨이 정수기")로 떨어진다.
`reader_problem` 1순위 분기는 **코드에 이미 있고 컬럼만 없다.**
- (a) `analysis_projects.reader_problem` 컬럼 추가 — 3시간, 마이그레이션 1건. 코드 변경 0
- (b) 컬럼 없이 프로젝트별 `purpose` 에 한 줄씩 사람이 쓴다 — 0.5시간, 스키마 변경 0
- (c) 그대로 (SaaS 판정이 0건이라 지금은 소비재 오판만 발생 중)

### Q6. T3 사람 채점 10건을 언제 할 것인가
`human_verdict` = **0행** → LLM 일치율을 **실측할 방법이 없다.**
`pickGradingSample`(관련5:무관5 균형, 재현 가능)·`parseGradingMarkdown` 은 이미 구현돼 있고,
10건이 들어가면 다음 배치부터 few-shot 이 켜진다(현재 `examples:0`).
- (a) 오늘 — 30분. T2 정밀도 첫 숫자 + 되먹임 점화
- (b) SaaS 판정이 생긴 뒤 (Q4 (a) 선행) — 소비재 기준으로 few-shot 을 학습시키지 않음
- (c) 안 한다 — T2 정밀도는 계속 "실측 불가"로 남는다

---

## 실측 불가 항목 (추측하지 않은 것)

| 항목 | 이유 |
|---|---|
| Gemini 유료 종량 실단가 | `budget.ts` 기본값은 자체 주석이 "보수적 추정치"로 명시. 리포에 실단가 기재 없음 |
| Gemini 무료 티어 RPM | 리포에 "429 경험"만. RPD 는 `llm.ts:40`·`angle-lock.ts:6` 의 "모델당 20건/일"이 유일한 기재값 |
| HN Algolia 공식 rate limit | 어댑터·`review-source-findings.md` 에 기재 없음. `paginationLimitedTo=1000` 만 확인 |
| YouTube Data API 일일 쿼터 | 리포에 기재 없음 |
| relevance 실행 1회 비용·호출수 | `agent_runs` 가 `status='running'`·`finished_at=null` — timeout 에 잘려 `finish()` 미호출 |
| extract 1건의 19호출 내부 분해 | `extract-run.ts` 의 LLM 호출 지점은 1곳. 나머지는 모델 체인 폴백 + `remedy-judge`. 호출별 로그 없음 |
| T2 ↔ 사람 일치율 | `human_verdict` 0행 |
| SaaS 프로젝트의 T2 정밀도 | SaaS 판정 0건 |
