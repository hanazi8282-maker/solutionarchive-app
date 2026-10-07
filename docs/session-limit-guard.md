# 구독 세션 한도 가드 — 측정·보정 절차

남헌 v30 §5(A안) → v32(소프트/하드 캡, 2026-10-07). 코드 `lib/analysis/session-guard.ts`, 설정 `config/session-guard.json`, 셀프테스트 `scripts/session-guard-selftest.mjs`(CI build-check 등록).

## 무엇을 막나

- 토큰을 쓰는 작업 단위 1회(야간 T2 판정 1회, extract 슬롯 1회 — 하루 3슬롯)마다 두 선을 둔다. 둘 다 상한이지 목표가 아니다.
  - **소프트 캡** `session_cap_pct`(15%) × 계수 = $6.45 — 닿으면 **새 프로젝트를 시작하지 않는다.** 이미 시작한 프로젝트는 끝까지 마치고 저장한다(경계에서만 검사).
  - **하드 캡** `hard_cap_pct`(30%) × 계수 = $12.9 — 진행 중 작업의 절대 상한. extract 는 `llm.ts` 가 매 claude -p **시작 전**에 보고 막는다(`CliHardCapError`, 돌고 있는 호출은 죽이지 않는다). T2 는 묶음(= 호출 1회) 시작 전에 본다.
- 수집 run 은 토큰을 안 쓰므로 대상이 아니다(셀프테스트가 수집 워크플로 진입점의 import 그래프 전체에 LLM 경로가 없는지 매번 본다). 하루 합산 상한은 두지 않는다(남헌 결정).
- `relevance-translate`(번역·배경)는 목록 밖이라 **상한 없이 기록만** 한다.

## 돈을 어떻게 세나

- `lib/analysis/llm.ts` 의 `callClaudeCli` 가 claude -p 봉투의 `total_cost_usd`(API 환산 명목값, 청구액 아님)를 호출마다 프로세스 누적기(`cliSpent()`)에 더한다.
  extract 한 건의 추출 본 호출뿐 아니라 뒤따르는 인용 번역·remedy-judge·경쟁사 프로필 호출까지 전부 들어간다.
  옛 `summary.cost_usd` 는 추출 본 호출만 더한 값이라(10-07 run 37581317529: $0.67 vs 로그 전체 $1.091) 가드는 그것을 쓰지 않는다. 5시간 창·주간 합산에서 **옛 행**은 그 값으로 떨어져 과소 집계된다.
- 비용을 못 읽은 호출(timeout SIGKILL·2MB 초과 출력·봉투 없음)은 $0 이 아니다: 판정 지출 = 읽은 합 + 모름 수 × 지금까지 본 호출 1회 최대(`spendForCap`).
  본 호출이 하나도 없으면(첫 본 호출이 timeout) 설정 `unit_cost_fallback_usd`($0.67 — 10-07 본 호출 최대 $0.197·프로젝트당 평균 $0.22·입력 90건 최대 ~$0.45 의 보수값)로 센다.
  폴백도 없으면 확인 불가 → 새 시작을 막는다(`cost_unknown`). 폴백이 없던 때는 첫 timeout 하나가 슬롯 전체를 세우고 같은 프로젝트가 맨 앞에서 최대 3슬롯을 연속으로 세울 수 있었다.
- $ → %p 환산은 `usd_per_session_pct`(설정값)다. 코드에 박지 않는다.

## 매 run 남기는 것 (`agent_runs.summary`)

- `stop_reason`: `null`(끝까지) · `session_cap`(소프트 캡) · `hard_cap`(하드 캡) · `cost_unknown` · `quota`(구독 한도 오류) · `weekly_stop` · `guard_config`(설정 못 읽음) · `save_failed`(T2)
- extract: `processed`·`not_started`·`retry_queue`·`retry_given_up`. T2: `batches_done`/`batches_planned`·`quota_project`.
- `session`: `spent_usd` · `spent_for_cap_usd` · `used_pct` · `cap_usd` · `hard_cap_usd` · `cap_pct` · `usd_per_pct` · `capped` · `claude_calls` · `cost_unknown_calls`
  · `window5h_usd`/`window5h_pct`(5시간 슬라이딩 창 합산, 이 실행 포함 — 막지 않고 보이게만) · `week_usd_lower_bound`
- 캡에 닿아 멈춘 실행은 `status='blocked'` + `::warning::` 이다. 정상 종료(`ok`)로 찍지 않는다(CLAUDE.md §7.2).
  `quota` 가 아닌 정지는 쿨다운·연속 blocked 경보를 걸지 않는다(`extract-auto.ts isQuotaBlocked`).
- run_key: nightly-relevance 의 네 스크립트(판정·2차·자동 승인·ca-v1)는 정규 `<접두>-<날짜>`, 재시도 `-r1`/`-r2`, 수동 `-m<run_id>`.

## 프로젝트 저장 원자성 (extract)

- 순서: 추출 본 호출(쓰기 없음) → 새 속성 insert → 옛 LLM 속성(새 id 제외, `human_confirmed=false`) delete → 프로젝트 update.
- 넣기 실패 → 아무것도 안 지움, 재추출은 이전 상태로 되돌림. 지우기 실패 → 방금 넣은 새 행을 지워 되돌림(보상). 보상도 실패하면 `failed` + 오류에 "중복 남음".
- 하드 캡이 저장을 가르지 않는다: 저장 사이에는 LLM 호출이 없다. 막히는 것은 저장 전 본 호출(→ 이전 상태 보존·시도 수 되돌림) 또는 저장 뒤 보강 단계(그 단계만 미완료).
- insert 가 성공 응답인데 돌려받은 id 수가 넣은 수와 다르면(null·빈 배열·일부) 옛 행을 지우지 않고 멈춘다 — "새 id 제외" 없이 지우면 방금 넣은 행까지 사라진다. 받은 id 는 걷어 내고, 이전 상태라고 장담 못 하므로 `failed` 로 남긴다.
- 남는 구멍: PostgREST 요청 사이에 트랜잭션이 없다.
  - insert~delete 사이 짧은 순간 두 벌이 보일 수 있고, 프로세스가 그 사이 죽으면(job timeout) 중복이 남는다.
  - **새 실패 모드(insert 순서를 앞으로 옮기며 생김)**: insert 가 서버에서는 들어갔는데 응답이 오류(예: 게이트웨이 504)로 오면 코드는 "넣기 실패"로 읽고 아무것도 안 지운 채 재추출을 이전 상태(`extracted`)로 되돌린다. 그러면 옛 속성 + 보이지 않게 들어간 새 속성이 함께 있는 **중복이 정상 상태처럼 보인다.** (`analysis_aspects` 는 PK 외 UNIQUE·트리거가 없어 DB 가 막아 주지 않는다.)
  - 근본 해결은 교체 전체를 한 트랜잭션으로 하는 Postgres 함수 1개(마이그 + 롤백) — 후속 PR 로 미룬다.

## 한도 오류(quota) 재시도

- extract: **한도 난 그 프로젝트만** `summary.retry_queue` 에 넣는다(마이그 없음). 4시간(또는 CLI 리셋 시각) 뒤 다음 실행이 큐 항목부터 돈다. 프로젝트당 최대 2회, 그다음도 한도면 큐에서 빼고 `::error::` + exit 1 → cron-watchdog → Notion.
  한도·하드 캡 실패는 그 프로젝트의 `extract_attempts` 를 1 되돌린다(재시도 상한 3회를 태우지 않게).
  실행 단위 쿨다운(PR #330, 폴백 4시간)은 그대로다 — 한도는 구독 전체에 걸리므로 그동안은 아무것도 안 돈다. 큐는 "풀린 뒤 무엇부터·몇 번까지"만 정한다.
  원래 1회 + 재시도 2회가 연속 한도면 실행 단위 경보도 그대로 뜨고, 그 뒤 s2·s3 는 쉬고 s1 만 하루 1번 확인한다.
- T2: 재시도 크론 r1(02:03Z)·r2(06:03Z). 정규 실행이 한도로 멈췄고 4시간(또는 리셋 시각)이 지났을 때만 돌고, 한도 난 프로젝트(`quota_project`)부터 판정한다.
  판정은 묶음마다 저장되고 이미 판정된 리뷰는 다시 안 타므로, 남은 판정만 이어서 한다. 아니면 기록 없이 exit 0 + `ran=false`.
  마지막 재시도까지 한도이거나 r2 가 한도 정지가 남은 채 쉬면 exit 1 → cron-watchdog(이 파일 10시간 유예) → Notion.
  **"최대 2회"는 실제로는 대부분 1회다**: 정규 실행이 Actions 지연으로 ~01:00Z 에 끝나면 +4시간 = 05:00Z 라 r1(02:03Z, 지연 포함 ~04Z)은
  "아직 이르다"로 쉬고 r2(06:03Z)만 도는 날이 대부분이다. 리셋 시각이 더 이르게 찍힌 날만 r1 이 돈다.
- 한계: Actions 스케줄은 1~3시간(extract 는 4~7시간) 늦게 뜬다. "정확히 4시간 뒤"가 아니라 "4시간 뒤 첫 슬롯"이다.

## 주간 중단 스위치

- `weekly_stop_pct`(N) 미설정이면 비활성. 설정하면 `usd_per_weekly_pct` 도 넣어야 한다 — 없으면 확인 불가라 **멈춘다**.
- 합산은 이 리포 `agent_runs` 의 가드 대상 실행(extract·T2·번역) 7일치뿐이다 → 실제 주간 사용률의 **하한**이다.

## 한도 측정 절차 (보정 계수 바꾸기)

**측정은 `workflow_dispatch` 로 실제 판정 모델을 돌려서만 한다. 로컬 `claude -p` 로 재지 않는다** —
로컬은 다른 계정·다른 모델 기본값·남헌의 대화형 사용과 섞여 %p 가 오염된다.

1. 측정 직전 claude.ai 사용량 화면에서 5시간 세션 %를 적는다(A). 다른 claude-cli 크론이 도는 시간대(야간 혼잡 구간)는 피한다.
2. `Nightly Extract` 또는 `Nightly Relevance Judge` 를 `workflow_dispatch`(dry_run=false, 작은 max_projects)로 한 번 돌린다.
3. 끝난 직후 같은 화면의 %를 적는다(B). 실행 로그의 `세션 사용(...) $X` 줄(= `summary.session.spent_usd`)을 읽는다.
4. 계수 = X ÷ (B − A). %p 눈금이 1%p 라 잡음이 ±1%p 다 — 한 번에 $1 이상 쓰는 실행으로 재고, 여러 번 재서 범위를 적는다.
5. `config/session-guard.json` 의 `usd_per_session_pct` 와 `_source` 를 고치는 PR 을 낸다. 소프트·하드 캡($)은 % × 계수로 따라 바뀐다.

실측 기록(남헌 v32 채택): run 37576816430(T2 50건 $0.20) + run 37581317529(extract 5건 $1.091) = $1.29 → +3%p → 약 $0.43/%p(범위 $0.3~0.65).

## extract 하루 건수 자동 조정 (남헌 v36 §2)

코드 `lib/analysis/extract-autotune.ts`, 셀프테스트 `scripts/extract-autotune-selftest.mjs`(CI build-check 등록).

- 스위치 리포 변수 `EXTRACT_AUTOTUNE`(기본 off). off 면 슬롯·하루 상한은 `EXTRACT_AUTO_MAX_PROJECTS`·`EXTRACT_AUTO_DAILY_MAX` 그대로다.
- on: 하루 D(시작 48 · 24~72) · 스케줄 슬롯 상한 ceil(D÷3)(≤24 → `timeout-minutes` 180). 수동 실행은 하루 상한만 D, 슬롯 상한은 입력값.
- 하루 1회(KST 첫 스케줄 run, 쉼 run 포함)만 평가. 한 스텝 = round(D×20%), 최소 1.
  - 내리기: 지난 평가 이후(첫 평가면 24시간) hard 캡·구독 한도 오류(수동 run 포함) 또는 주간 > 안전선. 소프트 한도(cost)로 멈춘 run 은 근거가 아니다.
  - 올리기: 마지막 조정 이후·7일 이내 스케줄 run(decision=run·**스위치 on 으로 돈 run**(`summary.autotune` 있음)·`cap_binding` 기록 있음·비용 전부 읽힘·claude 호출 ≥1) 최근 3회의 평균 사용률 < **10%**(config `autotune_up_below_pct`, 남헌 v42 §1 로 8→10 · 10.0% 정확히는 안 올림) ∧ 전부 slot/daily/none ∧ 대기(min_new 기준 B) > 0 ∧ 조정 전 D 로 이 슬롯이 쉬지 않는다 ∧ 직전 스케줄 run 3개 중 `running`(timeout 으로 죽음)이 없다
    ∧ **(조건 B, 남헌 v40 §1)** 그 3회 중 `cap_binding` 이 `slot` 또는 `daily` 인 run 이 1건 이상. `none`(대기를 다 처리하고 끝남)은 D 가 처리량을 막지 않았다는 뜻이라 none 만 3개인 윈도는 올리지 않는다(사유 "D 가 막은 증거 없음").
    - 임계 키가 없거나 수치가 아니거나 0 이하면 코드 폴백 8(옛 값 — 덜 올리는 쪽). 이번 평가가 쓴 값은 `summary.autotune.up_below_pct`.
  - 켠 직후: D 는 변수가 아니라 코드 상수 48(슬롯 16)로 바로 바뀐다. off 시절 run 은 올리기 근거가 아니라 첫 며칠은 "윈도 부족" 무변경이 정상이다.
  - 사용률 = `session.spent_usd`(전 호출 누적기) ÷ `usd_per_session_pct`. 비용 모름 호출이 있거나 호출 0회인 run 은 윈도에서 뺀다.
  - 이력을 못 읽어 하한 24 로 돈 run(`source='unreadable'`)의 d 는 다음 run 이 잇지 않는다.
  - 알려진 한계: timeout 으로 죽은 run 은 `running` 으로 남아 사용률·내리기 근거 어디에도 안 잡힌다(올리기만 보류).
- 기록: 모든 run 의 `summary.autotune`(유효 `d`·`slot_max`·`evaluated`·`action`·`prev`/`next`·`reason`·`window`·`avg_pct`·`pending`·`slot_runs`·`down_signals`·`weekly`·`up_below_pct`). 다음 run 이 가장 최근 `d` 를 잇는다. 이력을 못 읽으면 하한 24 로 돌고 평가하지 않는다.
- `summary.cap_binding`(slot/daily/cost/hard/none, 다섯 밖 정지는 null)은 스위치와 무관하게 매 run 남는다.
- 주간 안전선 `autotune_weekly_safe_pct`(config). null = 비활성(`weekly.state='disabled'`). `usd_per_weekly_pct` 가 없거나 7일 이력을 못 읽으면 unknown → 올리지 않음(내리지도 않음).
  - **현재 임시값(남헌 v40 §2, 2026-10-08): N = 75%, `usd_per_weekly_pct` = $1.29.** 첫 수동 측정 뒤 남헌이 재조정한다.
    근거: 10-07 T2 $0.20 + extract $1.09 = $1.29 를 썼는데 claude.ai 주간 %가 10→10 으로 안 움직였다 → 주간 1% ≥ $1.29(주간 100% 는 명목 $129 이상)라는 **하한**이다.
    실제 계수가 더 크면 실제 사용률은 더 낮으므로, $1.29 로 나누는 것은 사용률을 크게(=보수적으로) 잡는 쪽이다.
  - 계산: 7일 가드 대상 합 ÷ 1.29 > 75 이면 D −20%. 예) $60 → 46.51% 정상 · $96.75 → 75% 정확히 정상(초과만 내림) · $100 → 77.52% 내리기.
  - `usd_per_weekly_pct` 는 주간 중단 스위치와 같은 키지만 `weekly_stop_pct` 가 null 이라 그 스위치는 여전히 비활성이다.
  - **한계 — 이 합이 세지 못하는 사용.** 합은 이 리포 `agent_runs` 의 가드 대상 실행(extract·T2·번역) 7일치뿐이다.
    남헌의 대화형 Claude 세션(claude.ai·Claude Code), CMO·discovery·column-review 같은 다른 claude-cli 루프, 다른 리포·기기의 사용은 들어가지 않는다.
    그래서 이 %는 실제 주간 사용률의 **하한**이고, 대화형 사용이 많은 주에는 실제 주간 %가 75 를 넘어도 이 안전선은 걸리지 않을 수 있다.
    계수를 보수적으로($1.29) 잡은 것은 분모 쪽 보정일 뿐, 빠진 사용을 메우지 않는다.
- Notion: 조정(up/down) 이 있고 agent_runs 에 남은 run 만 `upsertStatusLog`(marker `extract-autotune`, 트랙 CTO)로 미러한다. 실패는 경고만. nightly-extract 의 env 에 `NOTION_API_TOKEN` 이 없으면 미러는 'env' 로 실패한다 — 정본은 agent_runs.

## 이 가드가 보장하지 않는 것

- 작업 단위별 캡이라 같은 5시간 창에 두 작업이 들어가면 창 합산은 소프트 30% 근처(하드로는 60%)까지 갈 수 있다(합산 상한 없음 — 남헌 결정). `window5h_pct` 로 보일 뿐 막지는 않는다.
- 창 합산은 끝난 실행 단위의 근사다. 진행 중인 다른 실행은 `window5h_unknown_runs` 로만 센다.
- 소프트 캡은 경계에서만 보므로 마지막 프로젝트 1건만큼 넘는다(실측 1건 ≈ $0.22, 입력 많으면 $0.3+). 그 넘침의 천장이 하드 캡이다.
- 비용 모름 호출의 추정은 "지금까지 본 최대 호출" 기준이라, timeout 호출이 실제로 더 비쌌다면 과소 추정된다.
