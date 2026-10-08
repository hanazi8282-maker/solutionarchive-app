# 약관 금지 소스 6곳 owner override 기록 — 영향 조사·선택지·권고 (v37/v38 작업 3)

- 작성: 2026-10-09 서브에이전트(DB 접근 없음, 파일만). **미적용.**
- 남헌 결정(v38 재확인): devto · disquiet · indiehackers · tumblbug · youtube · producthunt 6곳을 owner override 로 공식 기록.
  "quote_allowed=false · short_only 확인 후 보고. producthunt 는 enabled=false 유지, 기존 입력 1,128건 삭제 금지."
- 산출물(적용 순서대로, 롤백은 역순)
  1. `supabase/migrations/20261009000010_tos_owner_override.sql` (+ `_rollback.sql`) — override 6행
  2. `supabase/migrations/20261009000011_tos_quote_allowed_align.sql` (+ `_rollback.sql`) — disquiet·tumblbug quote_allowed true→false 2행.
     000010 선행 필수(사전 검사가 override='owner_2026-10-08' 을 본다, 없으면 RAISE).
  - `reports/2026-10-09/tos-override-quote-allowed-option.sql` — 2번의 검토 이력(머리에 "마이그로 승격됨" 표시, 돌리지 않는다).
- **2026-10-09 갱신**: 오케스트레이터 DB 실측 반영(§0) · quote_allowed 정렬 **포함 결정**(§3-3) · 확인 불가 해소 표시(§6) · 최근 실행 관찰(§7).

## 0. 오케스트레이터 DB 실측(2026-10-09, 서브에이전트는 DB 접근 없음 — 받은 값 그대로 옮김)

- 켜진 5곳 램프 cap_base: devto 60 · disquiet 52 · tumblbug 100 · youtube 200 — 있음. **indiehackers 는 cap_base=1 · 목표 0**(이번 작업 범위 밖).
- `pg_proc`·`information_schema.views` 에서 quote_allowed·override 를 읽는 객체 **0**.
- 기존 override 5개: appstore `owner_2026-10-05` · googleplay·kakao_blog·kakao_cafe `owner_2026-10-06` · shopify_apps `owner_2026-10-08` — 마이그 머리말의 리포 기준 예상과 일치.
- 결정: quote_allowed 정렬을 **포함**한다(남헌 v38 목표 상태 "quote_allowed=false · short_only").

## 1. 값 형식

- `override` = `<주체>_<YYYY-MM-DD>` — `supabase/migrations/20261005000001_review_meta_and_source_policy.sql:78` COMMENT.
- 선례: appstore `owner_2026-10-05`(20261005000002) · googleplay·kakao `owner_2026-10-06`(20261005000005·20261007000003) ·
  shopify_apps `owner_2026-10-08`(20261008000040:29).
- 남헌 결정일 2026-10-08 → **`owner_2026-10-08`** (shopify_apps 와 같은 값, 같은 성격 = 약관 예외 기록).

## 2. override 가 코드에서 읽히는 곳 전수(`git grep override` — lib·scripts·app, idea-pmf 의 `bottleneck_override` 등 동명이의 제외)

| # | 파일:줄 | 읽는 방식 | 6곳에 넣으면 |
|---|---|---|---|
| 1 | `lib/review/runner.ts:83-88` `OWNER_ROBOTS_OVERRIDES`·`isOwnerRobotsOverride` | 값 ∈ {10-05, 10-06} **이고** robots_status='disallowed' 일 때만 robots 금지 통과 | **변화 없음.** 10-08 은 집합 밖 + 6곳 robots 는 allowed/not_applicable. 셀프테스트로 6곳 모두 false 확인(아래 §5). robots 가 나중에 금지로 바뀌면 멈춘다(shopify 와 같은 의도) |
| 2 | `lib/review/runner.ts:621-625` | 위 판정 결과로만 robots 예외 | 변화 없음 |
| 3 | `lib/review/store.ts:111·142-143` loadSource | `robotsOwnerOverride`(=#1) · `overrideValue` 원값 | robotsOwnerOverride 그대로 false. overrideValue NULL→'owner_2026-10-08' |
| 4 | `lib/review/runner.ts:918` → `scripts/review-collect.mjs:414-419` → `lib/review/run-log.ts:43-54` | 실행 행 스냅샷 `review_collection_runs.override_value` | 켜진 5곳의 새 실행 행에 값이 남는다(기록만). producthunt 는 꺼져 있어 행 없음 |
| 5 | `lib/review/target-supply.ts:276` (+ 표시 `:346`, 조회 `scripts/target-supply.mjs:38`) | `tos_flag = (prohibited∨forbids_automation) ∧ !override` | 6곳 `tos_flag` true→false — 공급 보고의 "⚠️약관 플래그" 꼬리표가 사라진다. **표시 전용**(`:88` "게이트 아님", 소비처는 `:346` 한 곳) |
| 6 | `lib/review/request-cap.ts:164-178` ← `scripts/review-request-cap.mjs:100·166` | `ownerOverride = override != null` → verdict `'fixed'`(야간 상한 자동 상향 제외) | 켜진 5곳이 apply/hold/keep → **fixed**. 수집량 영향은 §2-2 |
| 7 | `scripts/dictionary-targets.mjs:120-122·277` sourceGuard | robots allowed/not_applicable 이면 override 안 봄 | 변화 없음 |
| 8 | `lib/review/ramp.ts:415` PCT_CEILING · `lib/review/latest-health.ts:166` HALT_ON_BLOCK_SOURCES | **키 하드코딩**(shopify_apps), override 안 읽음 | 변화 없음 — 6곳은 퍼센트 램프 50→90 상승·차단 시 계속 그대로 |

- app/ 화면에서 `review_sources.override` 를 읽는 곳: **0** (`git grep` 결과 app/ 의 override 는 PMF `bottleneck_override` 뿐).
- DB 쪽(뷰·함수·트리거): 리포 마이그레이션에는 override 를 읽는 뷰·함수가 없다. 리포 밖에서 만든 DB 객체는 **확인 불가**.

### 2-2. request-cap 'fixed' 의 실제 수집량 영향

- 러너 하루 예산 = `min(daily_request_cap, daily_request_target) − 오늘 쓴 요청` (`lib/review/runner.ts:550-551`).
- `daily_request_target = floor(min(cap_base, 배분 몫) × pct_step / 100)`, pct_step ≤ 90 (`lib/review/ramp.ts:23·344`, 마이그 20261006000002:17).
- `cap_base` = 2026-10-07 시점 `daily_request_cap` 스냅샷(20261007000040:7 — devto 60 · disquiet 52 · indiehackers 52 · tumblbug 100 · youtube 200), 무인 루프는 내리기만 한다.
- 자동 상향은 `daily_request_cap` 을 **올리기만** 한다 → cap ≥ cap_base > target. 즉 **램프 행에 cap_base 가 있는 동안 예산은 항상 target 이 정하고, cap 자동 상향은 요청량을 1건도 늘리지 않는다.**
  → 5곳을 'fixed' 로 바꿔도 **수집량 변화 0** (hackernews 는 6곳 밖이라 원래부터 무관).
- 수집량이 실제로 줄 수 있는 경우는 하나: 그 소스의 램프가 꺼진 상태(램프 행 없음·cap_base NULL·퍼센트 칸 못 읽음 → 예산 = `daily_request_cap`, `ramp.ts:734-740`)에서
  타깃이 늘어 수요가 cap 을 넘을 때. 그때도 지금까지 자동으로 오르던 것이 멈출 뿐 내려가지는 않는다.
- ✅ **해소(2026-10-09 오케스트레이터 실측, §0)**: devto·disquiet·tumblbug·youtube 4곳은 cap_base 있음 → 이 4곳의 'fixed' 전환은 수집량 변화 0 확정.
  indiehackers 는 cap_base=1·목표 0 이라 예산이 이미 목표 0 으로 묶여 있다 — 'fixed' 와 무관하게 지금도 램프 예산이 0 이다(그 원인·처리는 이번 범위 밖).
- (원래 기록) 리포에는 20261007000040(cap_base 입력) 적용 기록이 `docs/migration-exceptions.md` 에 없어 확인 불가였다. 확인 쿼리:
  `SELECT source_key, cap_base, pct_step, daily_request_target FROM public.review_source_ramp WHERE source_key IN ('devto','disquiet','indiehackers','tumblbug','youtube');`
  5행 모두 cap_base 가 있으면 위 결론(영향 0) 확정. 없는 행이 있으면 그 소스는 "cap 고정" 이 실효가 있다.
  참고 `SELECT source_key, previous_cap, new_cap, created_at FROM public.review_source_cap_log WHERE source_key IN (...) ORDER BY created_at DESC LIMIT 20;` — 최근 자동 상향 이력.

### 2-3. 선택지(수집량 부작용 처리)

- **A. 데이터만(권고).** 20261009000010 그대로 적용. 5곳은 shopify·kakao·googleplay 와 같은 "소유자 예외 = 상한은 사람이 정한다"(남헌 2026-10-06, request-cap.ts:15-16) 규칙을 따른다. 램프가 도는 한 영향 0. 상한을 올릴 일이 생기면 googleplay 40→60(20261007000040)처럼 사람 마이그로.
- B. 코드 수정 — request-cap 이 "robots 예외(OWNER_ROBOTS_OVERRIDES)인 override" 만 fixed 로 보게 좁힌다(약 3줄 + 셀프테스트). **비권고**: 남헌 2026-10-06 규칙("override 있는 소스는 대상 밖")을 세션이 좁히는 것이라 §10.2 예외 6번(명시 지시 축소)에 걸리고, kakao_blog·kakao_cafe·shopify_apps(robots 예외 아님) 상한도 다시 자동으로 오르게 된다.
- C. override 값을 다른 칸에 적기(예: last_test_result 메모) — 남헌 지시("review_sources 에 owner override 로 기록")와 다르다. 비권고.

## 3. disquiet · tumblbug 의 quote_allowed (true → false 할지)

### 3-1. DB 제약(supabase/migrations 전체 확인)

| 제약 | 정의(파일:줄) | 두 행에 대해 |
|---|---|---|
| `review_sources_tos_prohibited_no_quote` | `tos_status IS DISTINCT FROM 'prohibited' OR NOT quote_allowed` (20261005000001:70) | 두 행은 `forbids_automation` 이라 **이 제약이 true 를 막지 않는다** — 그래서 지금 true 로 남아 있다. false 는 언제나 통과 |
| `review_sources_quote_needs_citation` | `citation_allowed OR NOT quote_allowed` (000001:65) | false 는 언제나 통과 |
| `review_sources_tos_restricts_quote_policy` | 약관 금지 ⇒ quote_policy ≠ 'full' (000003:44-45) | quote_policy 는 안 바꾼다(short_only) |
| `review_sources_quote_policy_needs_citation` | `citation_allowed OR quote_policy='none'` (000003:39) | 무관 |

→ true→false 는 어떤 CHECK 도 깨지 않는다. 되돌릴 때(false→true)도 tos_status 가 forbids_automation 인 한 허용된다.

### 3-2. 인용 경로 — quote_allowed 를 읽는 코드가 없다

- `quote_allowed` 는 **deprecated** — 20261005000004:16-17 "quote_allowed 는 deprecated(코드는 안 읽음)", 20261005000002:11 같은 문장.
- `git grep quote_allowed` (lib·app·scripts, 마이그·md 제외) = 주석 3줄(`lib/analysis/evidence-quotes.ts:29` — 낡은 주석, `lib/review/adapters/shopify.ts:7`, `lib/signals/feed.ts:31`) + 셀프테스트 문자열 대조 2곳. **실행 코드 0.**
- 인용 게이트가 실제로 읽는 것은 `quote_policy` 하나:
  `lib/analysis/quote-policy-db.ts:21`(select key, quote_policy) → `lib/analysis/evidence-quotes.ts:78` quotePolicyOf · `:223`·`:267`(publicQuotes/publicLines) ·
  `lib/signals/feed.ts:99·222`. 호출처: `app/analyze/[id]/result/page.tsx:10` · `app/api/analyze/summary/route.ts:4` · `lib/insights/evidence.ts:33` · `lib/cases/summary.ts`.
- 6곳 quote_policy 는 이미 short_only 이고 이 작업은 안 바꾼다 → **이미 쌓인 입력의 인용 가능 여부 변화 = 0**(포함 안이든 제외 안이든).

### 3-3. 두 안과 권고

- 제외 안: 20261009000010 만 적용. disquiet·tumblbug quote_allowed=true 가 남는다 — 남헌 문구 "quote_allowed=false · short_only" 와 칸 값이 2곳 어긋난 채로 남는다(동작 영향은 0).
- 포함 안: 20261009000010 적용 뒤 `supabase/migrations/20261009000011_tos_quote_allowed_align.sql`(2행 가드·멱등·md5 불변·롤백 파일).
- **결정(2026-10-09 오케스트레이터): 포함 안.** 옵션 SQL 은 000011 로 승격됐다. 아래는 결정 전 권고 근거 그대로.
- **권고: 포함 안.** 지시 기본값은 "제외하고 보고"였지만 그 이유(인용 불가로 바뀌는 되돌리기 어려운 영향)가 실제로는 성립하지 않는다 — 읽는 코드가 없고 게이트는 quote_policy 만 본다(§3-2). 반면 남헌 문구는 6곳 모두의 목표 상태이고, 칸 값이 어긋나 있으면 나중에 누가 deprecated 칸을 다시 읽게 만들 때(또는 사람이 표를 볼 때) 혼선이 된다. 되돌림도 UPDATE 2행이다.
  단, 오케스트레이터가 리포 밖 DB 객체(뷰·함수)가 quote_allowed 를 읽지 않는지 한 번 확인한 뒤 적용:
  `SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%quote_allowed%';`
  `SELECT table_name FROM information_schema.views WHERE table_schema='public' AND view_definition ILIKE '%quote_allowed%';` — 둘 다 0행 기대.
  → ✅ 오케스트레이터 실측 2026-10-09: 0개(override 도 0개).

## 4. producthunt

- enabled 를 건드리지 않는다. 마이그 사전 가드가 `producthunt enabled=false` 가 아니면 RAISE(남헌 지시와 다른 상태면 멈춤).
- DELETE 없음 — analysis_inputs 1,128건 그대로. 확인 쿼리는 마이그 하단(적용 전·후 같은 수).
- 꺼진 소스라 override 의 동작 영향은 없다(러너가 enabled=false 에서 바로 건너뜀, request-cap 은 enabled 만 계산 — review-request-cap.mjs "꺼진 소스 제외"). 기록 목적만.

## 5. 셀프테스트(일회성 PGlite 0.2.17, 스크래치패드 — 리포에 넣지 않음)

- 스키마: 실제 `20260829000003` 의 CREATE TABLE review_sources 원문을 정규식으로 떼어 실행 + 000001·000003 의 review_sources 컬럼·CHECK 7개를 같은 정의로.
- 시드: 오케스트레이터 실측 6행 + shopify_apps·appstore·googleplay·hackernews·wordpress_org.
- 결과(2026-10-09 재실행, 000011 포함): **통과 39 · 실패 0**
  - 000010: 적용(6행·다른 행 md5 불변·override 밖 칸 불변·producthunt false 유지·owner_2026-10-08 총 7행·lock_timeout 비누출) ·
    재실행 0행 · 롤백(이전 상태와 완전 동일·shopify 유지·재실행 0행) · 음성 6종(producthunt 켜짐·다른 override 값·robots 금지·행 없음·인용 정책 다름·부분 적용 → 전부 RAISE·변경 0) ·
    롤백 음성(사람이 바꾼 값 있으면 RAISE).
  - 000011 순서 의존: 000010 없이 단독 실행 → RAISE("20261009000010 선행")·변경 0.
  - 000011: 000010 뒤 2행 · 6곳 모두 owner_2026-10-08/false/short_only · 다른 행 md5 불변 · 재실행 0행 · 롤백 2행(true 복원)·재실행 0행 ·
    역순 롤백(000011→000010) 뒤 처음 상태와 완전 동일 · 000011 적용 상태에서 000010 롤백만 먼저 돌려도 성공(quote_allowed 는 false 유지) ·
    000011 롤백 음성(그 사이 약관이 prohibited 로 바뀌면 RAISE·변경 0) · CHECK 대조(prohibited 에 true → 23514).
- 코드 대조(실제 lib 함수 import): `isOwnerRobotsOverride('owner_2026-10-08', allowed|not_applicable|disallowed)` = 6곳 모두 false ·
  `planSourceCap(..., ownerOverride:true).verdict` = 'fixed'.

## 6. 확인 불가 / 남은 것

- ✅ 해소 — 20261007000040(cap_base 입력) 적용 여부: 오케스트레이터 실측으로 4곳 cap_base 있음, indiehackers cap_base=1·목표 0(§0·§2-2).
- ✅ 해소 — 리포 밖 DB 객체(뷰·함수)의 override·quote_allowed 참조: 0개(§0).
- ✅ 해소 — 현재 다른 override 값 목록: 5개, 리포 기준 예상과 일치(§0).
- ✅ 반영 — 문서: `ops/state/source-review-queue.md`(승인 줄 1개) · `docs/review-collection-design.md` §1.3(6곳 블록). CLAUDE.md §7.1 은 robots 예외 목록이라 해당 없음.
- 남은 것(범위 밖): indiehackers cap_base=1·목표 0 의 원인·처리. 아래 §7 의 실행 관찰은 원인 미확인.

## 7. 관찰 — 최근 3일 실행 실측(오케스트레이터 2026-10-09 제공, 원인 미확인)

| 소스 | 요청 | 건수 |
|---|---|---|
| devto | 0 | — |
| tumblbug | 0 | — |
| disquiet | 43 | 42 |
| indiehackers | 11 | 44 |
| youtube | 14 | 16 |

- 관찰만 적는다. 요청 0 인 두 곳의 원인, indiehackers 의 요청 수보다 많은 건수가 무엇을 뜻하는지는 이 노트에서 판단하지 않았다(확인 안 함).
- 이 마이그(override·quote_allowed)는 위 수치에 영향을 주지 않는다 — override 는 robots 예외를 열지 않고(§2 #1), 램프 예산을 바꾸지 않으며(§2-2), quote_allowed 는 수집과 무관하다.
