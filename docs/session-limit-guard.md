# 구독 세션 한도 가드 — 측정·보정 절차

남헌 v30 §5(A안, 2026-10-07). 코드 `lib/analysis/session-guard.ts`, 설정 `config/session-guard.json`, 셀프테스트 `scripts/session-guard-selftest.mjs`.

## 무엇을 막나

- 토큰을 쓰는 작업 단위 1회(야간 T2 판정 1회, extract 슬롯 1회 — 하루 3슬롯)마다 5시간 세션의 `session_cap_pct`(시작 15%)를 **상한**으로 둔다. 목표가 아니다.
- 수집 run 은 토큰을 안 쓰므로 대상이 아니다. 하루 합산 상한은 두지 않는다(남헌 결정).
- `relevance-translate`(번역·배경)는 v30 §5 목록 밖이라 **상한 없이 기록만** 한다(남헌 결정 대기).

## 돈을 어떻게 세나

- `lib/analysis/llm.ts` 의 `callClaudeCli` 가 claude -p 봉투의 `total_cost_usd`(API 환산 명목값, 청구액 아님)를 호출마다 프로세스 누적기(`cliSpent()`)에 더한다.
  실패 봉투의 비용도 더하고, 봉투가 없어 비용을 못 읽은 호출은 0 달러가 아니라 `cost_unknown_calls` 로 센다.
- 그래서 extract 한 건의 추출 본 호출뿐 아니라 뒤따르는 remedy-judge·경쟁사 프로필·인용 번역 호출까지 전부 들어간다.
  옛 `summary.cost_usd` 는 추출 본 호출만 더한 값이라(10-07 run 37581317529: $0.67 vs 로그 전체 $1.09) 가드는 그것을 쓰지 않는다.
  5시간 창·주간 합산에서 **옛 행**은 `summary.cost_usd` 로 떨어지므로 과소 집계된다.
- $ → %p 환산은 `usd_per_session_pct`(설정값)다. 코드에 박지 않는다.

## 매 run 남기는 것 (`agent_runs.summary`)

- `stop_reason`: `null`(끝까지) · `session_cap`(이 실행 상한) · `quota`(구독 한도 오류) · `weekly_stop` · `guard_config`(설정 못 읽음) · `save_failed`(T2)
- extract: `processed`(실제로 돈 프로젝트 수) · `not_started`(골랐는데 못 돈 수). T2: `batches_done`/`batches_planned`.
- `session`: `spent_usd` · `used_pct` · `cap_usd` · `cap_pct` · `usd_per_pct` · `capped` · `claude_calls` · `cost_unknown_calls`
  · `window5h_usd`/`window5h_pct`(5시간 슬라이딩 창 합산, 이 실행 포함 — 상한이 아니라 눈에 보이게 하는 장치) · `week_usd_lower_bound`
- 상한에 닿아 멈춘 실행은 `status='blocked'` + `::warning::` 이다. 정상 종료(`ok`)로 찍지 않는다(CLAUDE.md §7.2).
  단 `session_cap` 은 한도 오류가 아니라서 쿨다운·연속 blocked 경보를 걸지 않는다(`extract-auto.ts isQuotaBlocked`).

## 한도 오류(quota) 재시도

- extract: 기존 슬롯 쿨다운(PR #330)을 그대로 쓴다. 리셋 시각을 못 읽으면 쿨다운 **4시간**(v30 §5, 전 5시간).
  원래 1회 + 재시도 2회가 연속 한도면 `::error::` + exit 1 → cron-watchdog 가 Notion 일일 상태 로그에 올린다. 그 뒤로 s2·s3 는 쉬고 s1 만 하루 1번 확인한다.
- T2: `nightly-relevance.yml` 에 재시도 크론 r1(02:03Z)·r2(06:03Z)가 있다. 오늘 정규 실행이 한도로 멈췄고 4시간(또는 CLI 리셋 시각)이 지났을 때만 돈다.
  아니면 기록 없이 exit 0 + `ran=false` 로 끝나고 2차 판정·자동 승인 스텝도 건너뛴다. 마지막 재시도까지 한도면 exit 1 → cron-watchdog → Notion.
- 한계: Actions 스케줄은 1~3시간(extract 는 4~7시간) 늦게 뜬다. "정확히 4시간 뒤"가 아니라 "4시간 뒤 첫 슬롯"이다.

## 주간 중단 스위치

- `weekly_stop_pct`(N) 미설정이면 비활성. 설정하면 `usd_per_weekly_pct` 도 넣어야 한다 — 없으면 확인 불가라 **멈춘다**.
- 합산은 이 리포 `agent_runs` 의 가드 대상 실행(extract·T2·번역) 7일치뿐이다. 남헌 대화형 사용·다른 claude-cli 루프(CMO·discovery·column-review)는 안 들어간다 → 실제 주간 사용률의 **하한**이다.

## 한도 측정 절차 (보정 계수 바꾸기)

**측정은 `workflow_dispatch` 로 실제 판정 모델을 돌려서만 한다. 로컬 `claude -p` 로 재지 않는다** —
로컬은 다른 계정·다른 모델 기본값·남헌의 대화형 사용과 섞여 %p 가 오염된다.

1. 측정 직전 claude.ai 사용량 화면에서 5시간 세션 %를 적는다(A). 다른 claude-cli 크론이 도는 시간대(야간 혼잡 구간)는 피한다.
2. `Nightly Extract` 또는 `Nightly Relevance Judge` 를 `workflow_dispatch`(dry_run=false, 작은 max_projects)로 한 번 돌린다.
3. 끝난 직후 같은 화면의 %를 적는다(B). 실행 로그의 `세션 사용(...) $X` 줄(= `summary.session.spent_usd`)을 읽는다.
4. 계수 = X ÷ (B − A). %p 눈금이 1%p 라 잡음이 ±1%p 다 — 한 번에 $1 이상 쓰는 실행으로 재고, 여러 번 재서 범위를 적는다.
5. `config/session-guard.json` 의 `usd_per_session_pct` 와 `_source` 를 고치는 PR 을 낸다. 상한($) = `session_cap_pct` × 계수.

실측 기록: 2026-10-07 T2 $0.20 + extract $1.09 = $1.29 → +3%p → 약 $0.43/%p(범위 $0.3~0.65). 시작값은 남헌 지시 $4.5(계수 0.3)로 둔다.

## 이 가드가 보장하지 않는 것

- 작업 단위별 15% 라서 같은 5시간 창에 두 작업이 들어가면 창 합산은 30% 근처까지 갈 수 있다(합산 상한 없음 — 남헌 결정). `window5h_pct` 로 보일 뿐 막지는 않는다.
- 창 합산은 끝난 실행 단위의 근사다. 진행 중인 다른 실행은 `window5h_unknown_runs` 로만 센다.
- 상한 판정은 단위(extract 1건·T2 묶음 1개) 사이에서만 한다. 다음 단위 크기를 지금까지 본 최대 단위로 가늠하므로, 첫 단위나 유난히 큰 단위는 상한을 넘길 수 있다.
