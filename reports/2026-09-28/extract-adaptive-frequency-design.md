> 작성: Opus (Fable 사용 한도 도달로 대체)

# 야간 extract 적응형 실행 빈도 — 설계 (구현 없음)

- 날짜: 2026-09-28 · 요청: 남헌 ("백로그가 크면 하루 2~3회 이상, 줄면 덜")
- 범위: **설계만.** 코드·워크플로·DB 변경 없음. 구현은 Opus 가 나중에 한다(§6).
- 근거로 읽은 파일: `.github/workflows/nightly-extract.yml`, `scripts/extract-auto.mjs`,
  `lib/analysis/extract-auto.ts`, `lib/analysis/extract-gate.ts`, `lib/analysis/budget.ts`,
  `lib/analysis/llm.ts`(claude-cli 경로), `scripts/agent-status.mjs`, `scripts/cron-watchdog.mjs`,
  `supabase/migrations/20260908000001_agent_ops.sql`, 전 워크플로의 `cron:` 줄.
- DB 는 보지 않았다. DB 사실이 필요한 자리는 "DB 필요 — 확인 불가" + 쿼리로 적었다(§7).
- 숫자 표기: 실측이 아니면 전부 **[추정]**.

## TL;DR

1. **방식 (a) 추천** — 크론 슬롯 3개(KST 03:33 / 12:33 / 18:33). 매 슬롯이 먼저 `pickAutoTargets` 로 백로그를 재고, 그 슬롯의 문턱(히스테리시스)보다 작으면 **이유를 남기고 exit 0** 으로 끝난다. 첫 슬롯은 지금처럼 대상이 1건만 있어도 돈다.
2. 상태(직전에 이 슬롯이 돌았나 · 오늘 몇 건 했나 · 최근 한도 정지)는 **새 테이블 없이 `agent_runs` 에서 읽는다.** 단 지금 `runKey = extract-auto-<KST날짜>` 라 하루 두 번째 실행이 첫 번째 행을 **덮어쓴다** — 슬롯 접미사가 선결 조건이다.
3. 한도 정지(`blocked`) 뒤 5시간 [추정] 안의 슬롯은 쉬고, 하루 상한은 프로젝트 24건 [추정]으로 둔다. 둘 다 오늘 밤 첫 claude-cli 실측으로 다시 맞춘다(§3.4).

---

## 0. 지금 구조에서 확인한 사실 (설계가 기대는 것)

| # | 사실 | 출처 | 설계에 주는 영향 |
|---|---|---|---|
| F1 | 백로그 정의는 이미 한 벌 있다: `pickAutoTargets` → `{eligible, remaining, belowMin, unknown, retryExhausted}` | `lib/analysis/extract-auto.ts` | 새 지표를 만들지 않고 이걸 쓴다 |
| F2 | 순서: SaaS → 첫 추출(collecting·failed) → 신규 많은 순. failed 는 `extract_attempts < 3` 만 | 같은 파일, `extract-gate.ts` | SaaS 는 이미 먼저 소진된다 |
| F3 | **`runKey: extract-auto-${kstDate()}`** + `agent_runs.run_key UNIQUE` + upsert(onConflict run_key) | `scripts/extract-auto.mjs:123`, `agent-status.mjs` | 하루 2회째가 1회째 행을 status='running' 으로 되돌려 덮고, 같은 step_key 도 덮는다. **다회 실행의 선결 수정** |
| F4 | 프로젝트당 LLM 호출 1회, 입력 상한 120,000자 | `extract-run.ts` | 프로젝트 수가 곧 소모량 |
| F5 | `budget.ts` 의 $5 는 **프로세스 단위 추정치**. 120k자 → 60k토큰 추정 × $0.5/M + 1,500 × $4/M ≈ **$0.036/건** | `budget.ts` | claude-cli 에서는 $5 상한이 사실상 안 걸린다(약 140건). 실제 상한은 **프로젝트 수**로 걸어야 한다 |
| F6 | claude-cli 호출 타임아웃 기본 **180초**(`LLM_CLAUDE_CLI_TIMEOUT_MS`), column-review 는 900초로 늘렸다 | `llm.ts callClaudeCli` | 120k자 추출이 180초를 넘으면 한도가 아니라 **일반 실패**로 잡혀 `extract_attempts` 가 오른다 → SaaS failed 3건이 영구 제외될 수 있다. **전환 PR 에서 확인할 것**(이 설계 범위 밖, 경보만) |
| F7 | claude-cli 실패는 지금 일반 `Error` 로 던져지고 `isQuotaFailure` 는 claude-cli 사용량 한도를 모른다 | `llm.ts` | 브리프대로 "사용량 한도 = quota stop" 은 오늘 전환 PR 이 넣는다고 전제한다. 이 설계는 그 결과(`out.quotaExhausted` → run status `blocked`)만 소비한다 |
| F8 | 감시는 `M H * * *` 형태만 이해하고, 크론 **줄마다** 판정한다. 실행을 슬롯 이후 24시간 창에서 **가장 최근 것 하나**로 판정하고 conclusion 이 `success` 가 아니면 이상 | `scripts/cron-watchdog.mjs` | no-op 슬롯은 반드시 `success` 로 끝나야 한다. `33 3,9,18 * * *` 한 줄로 쓰면 매일 "확인 불가" 경보 |
| F9 | 같은 구독 풀을 쓰는 스케줄: discovery 17:13Z · **extract 18:33Z** · insight-loop 18:41Z · relevance 19:03Z(timeout 90분) · daily-cmo-loop 20:17Z(timeout 240분). column-review 는 수동 | 각 yml `cron:` · `CLAUDE_CODE_OAUTH_TOKEN` grep | 야간 17:13Z~(최악)00:17Z+지연이 **구독 풀 혼잡 구간**. 추가 슬롯은 이 구간 밖에 둔다 |
| F10 | 리뷰 수집 슬롯: 17:37Z · **05:37Z** | `nightly-review-collect.yml` | 05:37Z 이후 슬롯은 낮 수집분까지 본다 |

KST 날짜 경계는 15:00Z 다. 아래 세 슬롯(18:33Z · 03:33Z · 09:33Z)은 3시간 지연돼도 모두 **같은 KST 날짜** 안에 떨어진다 — "오늘" 집계를 `kstDate()` 하나로 할 수 있다.

---

## 1. 백로그 지표

**정의(한 벌): 슬롯 시작 시점에 `pickAutoTargets(candidates, { minNew, max: Infinity })` 를 돌린 결과.**
`extract-auto.mjs` 가 이미 후보 조회·신규 수 계산을 하므로, 상한을 빼고 한 번 더 부르면 된다(추가 DB 조회 없음).

```
B   = pick.eligible                       // 기준(minNew=100)을 넘긴 전체 수. failed(시도<3) 포함
S   = eligible 중 productKindOf(business_model)==='software' 수
Bw  = B + S                               // SaaS 는 2배로 센다 [추정 가중치]
```

- **SaaS 가중치 2배**를 두는 이유: 순서(F2)로 SaaS 가 먼저 소진되긴 하지만, 그건 "어느 걸 먼저"만 정한다. "오늘 한 번 더 돌 가치가 있나"는 SaaS 가 남았는지에 더 민감해야 한다는 것이 피봇 방향(남헌 09-23)과 맞다. SaaS 1건만 남아도 Bw=2.
- **`unknown`(신규 수 확인 불가)은 B 에 넣지 않는다**(§7.1 — 0 도 아니고 1 도 아니다). 대신 unknown > 0 이면 결정 사유에 적고 `::warning::` 를 낸다(지금과 같다).
- `retryExhausted` 는 B 밖이다(사람 몫).

⚠️ **정상상태 함정 [추정]**: HN 이 주 소스인 `extracted` 프로젝트는 하루 수백 건씩 신규가 붙어(voc-expansion-investigation §4-2) 매일 다시 `≥100` 이 된다. 그러면 B 가 영영 0 으로 안 떨어지고 추가 슬롯이 늘 켜진다. 실제로 그런지는 DB 가 있어야 안다(§7 Q2). 결과에 따라 **결정 D5**(재추출 가중치 0.5) 를 고른다.

---

## 2. 방식 비교

| 기준 | (a) 크론 슬롯 N개 + 조기 종료 | (b) 봇 토큰 자기 재디스패치 | (c) 1회 실행 · max_projects 동적 |
|---|---|---|---|
| Actions 분 | no-op 슬롯도 checkout+`npm ci`+조회 ≈ 1~2분 [추정]. 공개 리포라 무료. 비공개 전환 시 3슬롯×30일 no-op 하한 ≈ 90~180분/월 [추정] | 도는 만큼만. 최소 | 최소 |
| 스케줄 지연 | 슬롯마다 1~3시간 지연(실측 패턴). 슬롯 간격 6~9시간이라 겹치지 않음 | 첫 실행만 지연, 이후 즉시 | 1회만 지연 |
| concurrency | 기존 `extract-auto` 그룹 그대로. 슬롯 간격 ≫ timeout 45분이라 대기열 없음 | 직전 실행 끝나기 전에 디스패치하면 pending 1개만 남고 **먼저 온 pending 은 `cancelled`** — 체인이 조용히 끊긴다 | 해당 없음 |
| 구독 풀 경합 | 추가 슬롯을 야간 혼잡 구간(F9) **밖**에 둘 수 있다 — 가장 유리 | 연속 실행이 한 롤링 창을 한꺼번에 먹는다. 첫 실행이 18:33Z 라 CMO 루프(20:17Z)와 정면 충돌 | 전부 18:33Z 한 번에 몰린다 → insight/relevance/CMO 와 같은 창. timeout 45분도 올려야 한다 |
| 실패·한도 동작 | 한 슬롯이 한도에 걸리면 그 슬롯만 멈추고, 다음 슬롯은 쿨다운 판정 후 재개. 자연스러운 "나중에 다시" | 한도에 걸리면 체인 종료 — 그날 끝. 버그 나면 폭주 위험 → 별도 하루 상한 필수 | 한도 1번 = 그날 끝(지금과 같다) |
| 권한 | 변경 없음 | `permissions: actions: write` 추가 필요(`GITHUB_TOKEN` 도 workflow_dispatch 는 트리거 가능하지만 권한이 있어야 한다) → **권한 확대 = §10.2 사람 판단 예외** | 변경 없음 |
| 감시 | 슬롯마다 판정된다(F8). no-op 은 success 로 끝나면 됨 | dispatch 실행은 `event=schedule` 가 아니라 감시 밖 — 체인 끊김이 안 보인다(§7.1) | 지금과 같다 |
| 구현량 | 중 (게이트 함수 + runKey + 크론 2줄) | 중상 (디스패치·체인 상한·권한) | 소 (변수 하나) |

**추천: (a).** 결정적인 이유는 둘이다. ① 구독 풀을 공유하는 이상 "언제 도는가"를 고를 수 있어야 하는데 (a) 만 혼잡 구간 밖으로 부하를 옮긴다. ② (b) 는 권한 확대가 필요하고 체인이 끊겨도 감시에 안 잡힌다.
(c) 는 따로 쓰지 않는다 — 다만 슬롯당 상한 `EXTRACT_AUTO_MAX_PROJECTS` 는 그대로 남아 (c) 의 손잡이 역할을 한다.

---

## 3. 슬롯 · 문턱 · 상한

### 3.1 슬롯 (결정 D3)

| 슬롯 | 크론(UTC) | KST | 역할 | 도는 조건 |
|---|---|---|---|---|
| s1 | `33 18 * * *` (기존) | 03:33 | 기본 | B ≥ 1 (지금과 같다) |
| s2 | `33 3 * * *` | 12:33 | 추가 1 | 히스테리시스 ON 5 / OFF 2 (Bw 기준) [추정] |
| s3 | `33 9 * * *` | 18:33 | 추가 2 | 히스테리시스 ON 12 / OFF 6 (Bw 기준) [추정] |

- 크론은 **줄마다 따로** 쓴다(F8). `github.event.schedule` 이 발화한 크론 문자열을 주므로 이걸 env(`EXTRACT_SLOT_CRON`)로 넘겨 슬롯을 식별한다. 코드의 슬롯 표에 없는 크론 문자열이면 **exit 2**(yml 과 코드가 갈라진 것 — 조용히 s1 취급하지 않는다).
- s2 는 야간 혼잡(17:13Z~00:17Z+지연)이 끝난 뒤 3시간 이상, s3 는 05:37Z 수집 뒤다. 둘 다 3시간 지연돼도 혼잡 구간(다음 17:13Z)에 닿지 않는다.
- `workflow_dispatch` 는 슬롯 `m` — 문턱을 건너뛴다(사람이 누른 것). 단 하루 상한·한도 쿨다운은 지킨다. 테스트용 입력 `slot`(s1/s2/s3)을 추가해 `dry_run` 과 함께 게이트 판정만 볼 수 있게 한다.

### 3.2 히스테리시스

슬롯별로 **"직전 같은 슬롯 실행이 일을 했나"** 로 문턱을 고른다.

```
prevRan = 이 슬롯의 가장 최근 agent_runs 행의 summary.decision === 'run'
threshold = prevRan ? OFF : ON
run = Bw >= threshold
```

- 오늘 예시(09-27 실측 B=13 + failed SaaS 3~4 → B≈16~17, S≈6~7 → Bw≈23 [SaaS 수는 추정]):
  s1 이 10건 처리 → s2 시점 잔여 ≈ 6~7건(소비재) → Bw 6~7 ≥ ON 5 → s2 가 전부 처리 → s3 시점 Bw≈0 → s3 쉼. **오늘 2회.**
- 백로그가 매일 20건 이상 들어오면 s2·s3 가 켜진 채 유지되고, 잔여가 OFF 아래로 빠질 때까지 꺼지지 않는다 — 1~2건 차이로 켜졌다 꺼졌다 하지 않는 것이 히스테리시스의 목적.
- 하한: 대상이 있으면 **하루 최소 1회(s1)**. "최소 2회"가 원래 뜻이면 s2 의 ON 을 1 로 두면 된다(결정 D2).

### 3.3 하드 상한

| 상한 | 값 | 어디서 | 비고 |
|---|---|---|---|
| 슬롯당 프로젝트 | `EXTRACT_AUTO_MAX_PROJECTS` (리포 변수, 현재 10) | 기존 | 45분 timeout 안에 들어가야 한다 — §3.4 로 재산정 |
| **하루 프로젝트** | `EXTRACT_AUTO_DAILY_MAX` 기본 **24** [추정] | 신규 변수 | 오늘(KST) `extract-auto-<오늘>-*` 행의 `summary.done + summary.failed` 합. 슬롯 max = min(슬롯 상한, 24 − 오늘 처리) |
| **하루 실행** | 스케줄 3 + 수동 | 구조 | 슬롯 수가 곧 상한 — 별도 카운터 불필요 |
| 하루 $ (budget.ts) | 그대로 | 기존 | claude-cli 에서는 안 걸린다(F5). 지우지 않는다 — gemini 로 되돌릴 때 필요 |

실패(`failed`)도 하루 상한에 센다 — 실패도 구독 풀을 쓴다.

### 3.4 첫 claude-cli 실측으로 다시 맞추기

오늘 밤 s1 로그에 두 줄이 찍힌다:
- `✓ <projectId> <secs>s ...` (프로젝트별 소요 — `agent_run_steps.detail.seconds` 에도 남는다)
- `[analysis/llm] claude-cli 실측 total_cost_usd=… in=… out=… cache_read=…` (프로젝트별 1줄, F4)

재산정 절차(3일치 모이면 확정, 1일치로 1차):

1. **슬롯 상한** = floor((45분 − 8분 여유) × 60 / p90(secs)). 예: p90 150초 → 14, p90 300초 → 7. 결과가 10 보다 작으면 리포 변수를 내린다.
2. **타임아웃 점검**: p90 이 150초를 넘으면 `LLM_CLAUDE_CLI_TIMEOUT_MS` 180초 기본값(F6)이 위험하다 — 600초로 올린다(전환 PR 몫).
3. **풀 점유율**: 같은 밤 CMO·insight·relevance 로그의 `total_cost_usd` 합과 extract 합을 비교한다. `total_cost_usd` 는 **API 환산 명목값**이지 청구액이 아니다 — 절대액이 아니라 **비율**로만 쓴다. extract 가 하루 풀 명목값의 50% [추정] 를 넘으면 하루 상한을 줄인다.
4. **한도 빈도**: 7일 동안 extract `blocked` 가 2회 이상이면 하루 상한 −30%, 0회인데 B 가 3일 연속 늘면 +30%. 변경은 리포 변수로만(코드 수정 없이).

한 줄 보강(구현 §6-4): `runExtraction` 결과에 claude-cli 봉투의 `total_cost_usd` 를 실어 `agent_run_steps.detail.cost_usd` 로 남기면, 로그를 긁지 않고 §7 Q4 한 쿼리로 재산정할 수 있다.

---

## 4. 안전장치

### 4.1 한도 정지가 슬롯을 건너 이어지게 (상태는 `agent_runs`)

- 지금도 한도에 걸리면 run status=`blocked` + blocker 문구로 끝난다(F7 전제). 새 저장소를 만들지 않는다.
- 슬롯 시작 시: **최근 5시간 [추정] 안에 끝난 `extract-auto-*` 실행 중 status='blocked'** 가 있으면 이 슬롯은 쉰다.
  - 5시간 = 구독 롤링 창 길이 [추정 — 플랜별로 다르다, 공개 문서 확인 필요].
  - 전환 PR 이 CLI 오류 문구에서 **리셋 시각**을 뽑을 수 있으면 `summary.quota_reset_at` 에 넣고, 그 값을 5시간보다 우선한다. 문구 파싱에 실패하면 5시간으로 떨어진다(없는 값을 "지금 리셋됨"으로 읽지 않는다 — §7.1).
- 주간 한도처럼 5시간 뒤에도 안 풀리면: 다음 슬롯이 1건째에서 다시 `blocked` → 또 쉼. 하루 최대 3번 1건씩만 시도하므로 폭주하지 않는다. `blocked` 가 **연속 3슬롯**이면 `::error::` + exit 1 로 올려 감시(Actions 실패 메일)에 잡히게 한다 — 한도가 풀리지 않는 것은 사람이 봐야 할 사건이다.
- 다른 잡(CMO·insight·relevance)의 한도 정지는 이번 설계에서 **보지 않는다** — 그 잡들의 blocker 문구 형식이 제각각이라 문자열로 판정해야 하는데, `llm.ts` 가 명시적으로 금지한 방식이다. 필요하면 결정 D8.
- **DB 를 못 읽으면**(agent_runs 조회 실패): s1 은 지금처럼 진행(백로그 조회 자체가 DB 라 어차피 실패하면 exit 2). s2·s3 는 **쉬고 `::warning::`** — 상태를 모른 채 구독 풀을 태우지 않는다. "확인 불가"를 "한도 없음"으로 접지 않는다.

### 4.2 조기 종료도 기록한다 (§7.2)

쉬는 슬롯도 `agent_runs` 행을 남긴다(스키마 주석: "dry_run 실행도 기록한다 — 안 남기면 '어젯밤 왜 아무것도 안 바뀌었나'에 답을 못 한다").

- run_key: `extract-auto-<KST날짜>-<s1|s2|s3|m<run_id>>` (F3 수정)
- run status: `ok`, 스텝 1개 `gate` status=`skipped`
- `summary`: `{ decision: 'skip'|'run', reason, slot, B, S, Bw, threshold, prev_ran, done_today, daily_max, max_this_run, quota_cooldown_until, unknown }`
- 로그 한 줄(판단 가능한 수치 포함):
  `슬롯 s2 쉼 — Bw 3 < OFF 6(직전 s2 실행함) · B 3(SaaS 0) · 오늘 처리 10/24 · 한도 쿨다운 없음`
  `슬롯 s3 쉼 — 한도 쿨다운(09:12Z blocked, ~14:12Z 까지)`
- Actions 표시: `::notice::`(쉼) / `::warning::`(쿨다운·확인 불가) — 초록/빨강이 아닌 것을 구분.
- 돈 슬롯은 기존 `select` 스텝 detail 에 같은 결정 필드를 붙인다.

### 4.3 감시(cron-watchdog)와의 정합

- **바꾸지 않아도 되는 것**: no-op 슬롯이 스크립트 안에서 `exit 0` 으로 끝나면 conclusion=`success` → 정상 판정. 21:53Z 기준 s2(03:33Z, 18h20m)·s3(09:33Z, 12h20m)는 같은 날, s1 은 지금처럼 다음 날 판정.
- **지킬 것**
  - 크론 3줄을 각각 `M H * * *` 로(F8).
  - 건너뛰기를 **job 레벨 `if:`** 로 하지 않는다. 모든 job 이 skip 되면 run conclusion 이 `skipped` 로 찍힐 수 있고 [추정] `judgeRuns` 는 success 가 아니면 이상으로 올린다. 게이트는 스크립트 안에서.
  - 한도 `blocked` 는 지금처럼 exit 0(확인 대상이지 실패 아님), 연속 3슬롯만 exit 1(§4.1).
- **알고 두는 약점**: `judgeRuns` 는 "슬롯 이후 24시간 안의 가장 최근 실행 하나"를 본다. 같은 파일에 슬롯이 3개면 s2 가 미발화해도 s3 실행이 그 자리를 메워 **s2 미발화가 안 보인다.** 선택 수정(§6-5): 창의 상한을 `min(슬롯+24h, 같은 파일의 다음 슬롯)` 으로 줄이기 + 셀프테스트 1케이스. 안 고쳐도 사고는 "추가 슬롯 하나가 하루 빠짐"이라 급하지 않다.

---

## 5. 흐름 요약 (구현자용)

```
extract-auto.mjs
  1) slot = SLOTS[EXTRACT_SLOT_CRON] ?? (dispatch ? 'm' : exit 2)
  2) 후보 조회 + 신규 수 (기존)
  3) full = pickAutoTargets(c, {minNew, max: Infinity})      → B, S, Bw, unknown
  4) state = agent_runs 조회 1회: 오늘 extract-auto-<오늘>-* 행들 + 이 슬롯 최근 행 + 최근 5h blocked
  5) d = decideSlot({slot, Bw, prevRan, doneToday, dailyMax, slotMax, lastBlocked, consecutiveBlocked, now})
       → { run, reason, max }                                   // 순수함수, 셀프테스트 대상
  6) run=false → tracker(run_key=…-slot) + gate 스텝 skipped + summary → exit 0
  7) run=true  → pick = pickAutoTargets(c, {minNew, max: d.max}) → 기존 루프 그대로
```

---

## 6. 구현 분해 (Opus, 합계 약 4.5~5시간 [추정])

전제: 오늘의 claude-cli 전환 PR(사용량 한도 → `quotaExhausted`)이 먼저 main 에 들어가 있어야 한다.

| # | 파일 | 내용 | 시간 |
|---|---|---|---|
| 1 | `lib/analysis/extract-auto.ts` | `SLOTS` 표(크론→슬롯·ON·OFF), `backlogOf(pick, candidates)`(B·S·Bw), `decideSlot(...)` 순수함수. 새 파일 대신 기존 순수 모듈에 추가 | 1.0h |
| 2 | `scripts/analyze-extract-auto-selftest.mjs` (기존) | decideSlot 케이스: ON/OFF 경계, prevRan 전환, 하루 상한 잔여, 쿨다운 안/밖, reset_at 우선, 연속 blocked 3, 모르는 크론, 수동 슬롯, unknown 처리 | 0.8h |
| 3 | `scripts/extract-auto.mjs` | 슬롯 해석, **runKey 슬롯 접미사(F3)**, agent_runs 상태 조회 1회, 쉼 기록(§4.2), `--dry` 에서도 게이트 판정 출력 | 1.3h |
| 4 | `lib/analysis/llm.ts` · `extract-run.ts` | claude-cli 봉투의 `total_cost_usd` 를 결과에 실어 `detail.cost_usd` 로(§3.4). 전환 PR 이 리셋 시각을 뽑으면 `quota_reset_at` 전달 | 0.5h |
| 5 | `.github/workflows/nightly-extract.yml` | 크론 2줄 추가, `EXTRACT_SLOT_CRON: ${{ github.event.schedule }}`, `EXTRACT_AUTO_DAILY_MAX: ${{ vars.EXTRACT_AUTO_DAILY_MAX \|\| '24' }}`, dispatch 입력 `slot`. `permissions` 변경 없음 | 0.3h |
| 6 | (선택) `scripts/cron-watchdog.mjs` + selftest | 다중 슬롯 창 상한(§4.3) | 0.5h |
| 7 | 검증 | 셀프테스트 → `workflow_dispatch` dry_run × slot s1/s2/s3 → 로그에 결정·수치가 찍히는지, agent_runs 에 행 3개가 **따로** 생기는지 확인 | 0.5h |

§10.2 적합성: 워크플로 수정은 자율 범위(드라이런·revert 한 줄·슬롯 사이 머지·Notion 기록). 시크릿·`permissions` 확대 없음. 마이그레이션 없음. → 세션 자체 판단으로 머지 가능. (b) 를 고르면 `actions: write` 추가라 사람 판단 예외다.

---

## 7. DB 필요 — 확인 불가 (구현 전 오케스트레이터가 돌릴 쿼리)

**Q1. 지금 백로그 (pickAutoTargets 근사)** — §3.2 예시의 S(SaaS 수)를 확정

```sql
select p.id, p.status, p.business_model, p.extract_attempts,
       (select count(*) from analysis_inputs i
         where i.project_id = p.id and i.purged_at is null
           and (p.status = 'failed' or p.extract_finished_at is null
                or i.created_at > p.extract_finished_at)) as new_inputs
from analysis_projects p
where p.status in ('collecting','extracted','failed')
order by new_inputs desc;
-- eligible = new_inputs >= 100 and not (status='failed' and extract_attempts >= 3)
-- SaaS 판정은 코드(productKindOf)가 정본이다 — SQL 로 business_model 문자열을 재현하지 말고 눈으로 대조
```

**Q2. 재추출 후보의 하루 유입 (정상상태 함정, 결정 D5)**

```sql
select p.id, p.business_model, date_trunc('day', i.created_at) as d, count(*)
from analysis_projects p join analysis_inputs i on i.project_id = p.id
where p.status = 'extracted' and i.purged_at is null
  and i.created_at > now() - interval '7 days'
group by 1,2,3 order by 1,3;
-- 하루 100건 이상이 꾸준한 프로젝트 수 = 매일 B 에 다시 들어오는 바닥값
```

**Q3. extract-auto 실행 이력 (덮어쓰기 흔적 포함, F3)**

```sql
select run_key, trigger, status, started_at, finished_at, summary
from agent_runs where run_key like 'extract-auto-%'
order by started_at desc limit 20;
```

**Q4. 실측 재산정 (§3.4, 오늘 밤 이후)**

```sql
select r.run_key, s.step_key, s.status,
       (s.detail->>'seconds')::int as secs, s.detail->>'model' as model, s.detail->>'cost_usd' as cost
from agent_runs r join agent_run_steps s on s.run_id = r.id
where r.run_key like 'extract-auto-%' and s.step_key like 'extract-%'
  and r.started_at > now() - interval '3 days'
order by r.started_at desc, s.seq;
-- cost_usd 는 §6-4 이후에만 채워진다. 그 전에는 Actions 로그의 "claude-cli 실측 total_cost_usd" 줄을 쓴다
```

---

## 8. 남헌 결정 (선택지 + 추천)

| # | 질문 | 선택지 | 추천 |
|---|---|---|---|
| D1 | 방식 | (a) 슬롯 3개 + 조기 종료 · (b) 자기 재디스패치 · (c) 1회·동적 상한 | **(a)** — 혼잡 구간 회피, 권한 확대 없음, 감시에 보임 |
| D2 | 하루 최소 횟수 | 1회(대상 있으면 s1) · 2회 고정(s2 ON=1) | **1회** — "줄면 덜"과 맞는다 |
| D3 | 추가 슬롯 시각 | KST 12:33·18:33 · 다른 시각 | **12:33·18:33** — 야간 구독 혼잡(02:13~09:17 KST+지연) 밖 |
| D4 | 하루 상한 | 24건 [추정] · 다른 값 · 상한 없음 | **24건으로 시작, §3.4 실측 3일 뒤 조정** |
| D5 | HN 재추출이 매일 백로그를 채우면 | 그대로(추가 슬롯 상시 가동) · 재추출은 가중치 0.5 · 재추출은 s1 에서만 | **Q2 결과를 보고 결정.** 바닥값이 3건 이상이면 "재추출 비SaaS 0.5" |
| D6 | 한도 정지 후 쉬는 시간 | 5시간 [추정] · 그날 나머지 전부 · CLI 리셋 시각 | **리셋 시각 우선, 못 읽으면 5시간** |
| D7 | s1 위치(야간 혼잡 한복판 18:33Z) | 유지 · s1 을 뒤로 옮겨 CMO 보호 | **유지** — 첫 실측에서 CMO 루프가 한도에 걸린 날이 생기면 재검토 |
| D8 | 다른 잡(CMO 등)의 한도 정지도 extract 를 멈추게 할지 | 안 봄 · 본다(blocker 문구 규약 통일 필요) | **안 봄(지금은)** — 문자열 판정 금지 원칙과 충돌 |

---

## 부록 — 오케스트레이터 DB 확인 (2026-09-28, D5 유입량)

- [측정값] 이미 extracted 인 프로젝트의 최근 7일 일평균 신규 입력: 4fcea3ff(소비재) 411 · cd0a1a19 246 · e819f101 244 · ee68cb68 211 · 9fece18e 84 · Cal.com 45 · Baremetrics 29 · Lemon Squeezy 29 (SaaS 7개).
- 함의: 5개가 1~2일마다 재추출 문턱(신규 100)을 넘는다 → 백로그가 0 으로 내려가지 않고 추가 슬롯이 사실상 상시 켜진다. D5 는 "3개 이상" 조건을 이미 충족 — 재추출 가중치(비 SaaS 0.5) 또는 재추출 전용 최소 간격(예: 프로젝트당 48h)을 설계에 넣어야 한다.
