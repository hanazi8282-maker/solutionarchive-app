# S12-budget — 판정 과금 상한 배선 · 11-19 판정 크론 실패 · 품질 표시 대기열 제외 (v71cu-3 §2)

작성 2026-11-19 · 서브에이전트(DB 접근 없음 — 끝의 "오케스트레이터가 DB로 확인할 것" 참조) · 브랜치 `feat/v71cu-s12-budget`

## (a) 판정 과금 상한 일 $75 · 월 $2,000 — 코드가 읽고 멈춘다

**전에는:** 리포 변수 `JUDGE_DAILY_USD_CAP=75`·`JUDGE_MONTHLY_USD_CAP=2000`(11-18 20:51Z 설정)을 읽는 코드가 없었다(S13 "아직 코드가 읽지 않는 것").
`budget.ts` 의 하루 상한(`LLM_DAILY_BUDGET_USD`, 현재 $15)은 **프로세스 단위**라 슬롯·체인 hop 마다 0 에서 다시 시작했다.

**지금:**
- `lib/analysis/budget.ts`
  - `judgeUsdCaps(env)` — 두 변수를 읽는다. 비거나 0·문자면 75·2000.
  - `loadJudgeLedgerRows` — 원장 = `agent_runs` 의 `relevance-judge-*`·`relevance-second-*` 행(이번 달 KST), `summary.est_usd`. 새 테이블·마이그레이션 없음.
  - `judgeLedgerFrom` — 오늘(KST)·이번 달 합. **끝나지 않은 실행(status=running, est_usd 없음)은 0 으로 접지 않고 프로세스 상한(LLM_DAILY_BUDGET_USD)으로 센다** — 11-19 처럼 죽은 실행의 지출을 모르기 때문(§7.1). 끝났는데 est_usd 가 없는 행(가드·주간 정지 등 LLM 호출 전 종료)은 0.
  - `judgeBudgetGate` — 남은 몫 = min(일 상한 − 오늘, 월 상한 − 이번 달). 0 이하면 stop. 과금 경로인데 원장을 못 읽으면 stop.
  - `setRunCapUsd` — 남은 몫을 이 프로세스의 상한으로 건다. `reserveOrThrow` 가 호출 **전에** 던진다(로그만 남기지 않는다). 실행 누적은 UTC 날짜가 바뀌어도 리셋하지 않는다.
- **구독 경로와 과금 경로를 가른다.**
  - 1차(`relevance-judge-auto.mjs`): `provider` 가 gemini·anthropic 일 때만 계량. **claude-cli(현재 운영값)는 `과금 상한 — 계량 불가(구독 경로 claude-cli, 청구 없음 · 일 $75/월 $2000 미적용)`** 를 로그와 `summary.billing` 에 남기고 상한을 걸지 않는다. 계량인데 상한 도달이면 판정 0건, `stop_reason='usd_cap'`, blocked.
  - 2차(`relevance-second-judge-auto.mjs`): gemini 고정 = 항상 계량. 도달이면 묶음 0개, 실행 중 넘으면 `callGeminiRotating` 이 stop 으로 받아 blocker 로 끝난다. `summary.billing` 기록.
- `.github/workflows/nightly-relevance.yml`: 1차·2차 스텝 env 에 `JUDGE_DAILY_USD_CAP`·`JUDGE_MONTHLY_USD_CAP`(리포 변수, 새 시크릿 없음).
- ⚠️ 한계(그대로 둔 것):
  - 금액은 `budget.ts` **추정치**(2자=1토큰, 보수 단가)다. 실청구가 아니다. Gemini 무료 티어면 실청구는 0 일 수 있다.
  - 원장 합산 대상은 판정 두 스크립트뿐이다. extract·번역 등 다른 과금 호출은 이 $75/$2,000 에 안 들어간다(지시가 "판정 상한"이라 범위를 좁혔다).
  - `LLM_MONTHLY_CAP_USD=450`·`LLM_MONTHLY_ALARM_USD=340` 리포 변수(10-18 설정)도 코드가 읽지 않는다 — 이번 범위 밖, 보고만.
  - "구독 한도 소진 → API 키로 이어서 판정" 분기는 여전히 없다(S0 Q10). 지금 과금 경로는 2차 gemini 와 1차를 gemini 로 되돌렸을 때뿐이다.
- 셀프테스트: `scripts/analyze-llm-budget-selftest.mjs` 20 → 37건(KST 경계·원장 합·죽은 실행 상한치·LLM 전 종료 0·일/월 도달 멈춤·원장 확인 불가 멈춤·구독 계량 불가·남은 몫이 실제로 던짐·두 스크립트와 워크플로 배선).

## (b) Nightly Relevance Judge 2026-11-19 실패(run 44433192834)

로그는 `log not found`(만료·미업로드). 실행 메타데이터와 check-run 주석은 아직 읽힌다.

**확정(API 실측):**
- 발화: schedule, 생성 00:57:48Z, head `13d8786a`. 정규 슬롯(`3 19`) 이 약 5시간 54분 늦게 발화한 것으로 보인다(시각으로 추정).
- 스텝: 판정(1차, step 6) **성공** 00:59:01→01:12:39(13.6분). 2차 판정(step 7) 01:12:39 시작 → **잡 종료 02:31:53 까지 `in_progress`**, 뒤 스텝(자동 승인·ca-v1·리포트) pending, relaunch 건너뜀.
- check-run 주석(실패 사유 원문): **"The hosted runner lost communication with the server. Anything in your workflow that terminates the runner process, starves it for CPU/Memory, or blocks its network access can cause this error."**
- 시간 상한 탓이 아니다: 잡 94분(timeout 270), 2차 스텝 79분(timeout 165, 스크립트 마감 150분).
- 이 실행은 **`JUDGE_DAILY_ITEMS_SECOND=5000`(11-18 20:51:44Z 설정) 이 처음 적용된 실행**이다. 워크플로가 `RELEVANCE_SECOND_MAX: vars.JUDGE_DAILY_ITEMS_SECOND || vars.RELEVANCE_SECOND_MAX` 라 2차 상한이 1000 → 5000(묶음 50 → 250)으로 올랐다. 직전 성공(44336320206, 11-18)은 상한 1000, 2차 57분, 기록 897건.
- 직전 성공 로그 실측: 2차는 시작하자마자 후보 65,375행을 읽고, **영역 밖 제외(40,755건) 전에** 남은 행 전부의 `raw_text` 를 `analysis_inputs` 에서 100건씩 읽어 메모리 Map 에 들고 스텝 끝까지 유지한다(선정에 6분). 실제로 판정하는 건 그중 상한(1000)뿐이다.

**재현 가능한 후보(추론 — 로그가 없어 확정 못 함):**
1. **2차 스텝의 메모리 압박 [추론, 가장 유력하지만 약함].** 원문 약 6.4만 건을 통째로 들고 있다가, 상한 5000 으로 루프가 처음으로 80분 넘게 돈 날 러너가 끊겼다. 다만 루프 중에는 메모리가 거의 늘지 않는 구조라(묶음마다 20행 프롬프트·행 단위 UPDATE), "5000 이 원인"이라고 단정할 근거는 없다. V8 힙 초과였다면 보통 `heap out of memory` 로 스텝이 실패하지 러너가 끊기지 않는다. 확인 방법: 같은 조건으로 `workflow_dispatch`(dry_run=false) 한 번 돌리며 스텝 안에 `free -m` 을 찍거나, 2차 스크립트에서 원문을 `picked` 만 읽도록 바꾼 뒤 비교.
2. **GitHub 호스티드 러너 일시 장애 [추론].** 이 주석은 러너 VM 회수·네트워크 끊김에도 똑같이 뜬다. 최근 25회 중 실패는 이 1회뿐이라 일회성일 가능성도 크다.
3. **1차 스텝이 남긴 `claude -p` 손자 프로세스 [추론, 약함].** `lib/insight/claude-cli.ts` 는 타임아웃 때 직계 자식만 SIGKILL 한다. 손자가 남아 자원을 먹었을 수 있지만, 1차는 13.6분에 정상 끝났고 근거가 없다.

**이번 PR 에서 고치지 않은 것:** 2차 원문 적재 범위 축소(후보 1의 완화책)는 넣지 않았다. 원인이 확정되지 않았고, 주제 라벨 경로(`RELEVANCE_SECOND_TOPIC_DAILY=400`)가 영역 밖 행의 원문도 쓰므로 순서를 바꾸려면 따로 검증해야 한다. 당장 위험을 줄이려면 리포 변수 `JUDGE_DAILY_ITEMS_SECOND` 를 지우거나 1000 으로 내리면 11-18 까지의 조건으로 돌아간다(사람·역할 세션 판단).

**부수 영향(확정):** 2차가 `tracker.finish` 전에 죽었으므로 `agent_runs` 의 이 실행 2차 행은 `running` 으로 남아 있을 것이다. 새 원장 합산은 이 행을 상한치($15)로 센다(11월 월 합에 +$15).

## (c) S12 품질 표시 글을 판정 대기에서 뺀다

- 대기열을 만드는 곳: `lib/analysis/relevance-pending.ts` `createPendingFor` — `countFor`(후보 프로젝트의 미판정 수, 체인 "남았나"·순서용)와 `pendingFor`(이번에 돌 프로젝트의 실제 판정 목록). 둘 다 넣었다. 1차 판정 스크립트만 이 모듈로 대기열을 만든다(2차는 1차 판정 행을 따라가므로 자동으로 줄어든다).
- 제외 조건 `qualityExcludes(flag, rule_ver)`: `too_short`·`near_dup`·`quote_only`·`dev_reply` 는 규칙 버전 무관, **`promo` 는 `cq-v2` 만**(S12.md: cq-v1 promo 는 오탐 약 절반이라 쓰지 않는다).
- `content_quality_flags` 는 실행당 한 번만 읽는다(수천 행). 이미 판정된 글은 품질 수에 세지 않는다. 삭제·판정 행 기록이 아니라 필터다.
- 3상태: 표 없음(PGRST205·42P01) → 경고 + 원래대로 / 그 밖 조회 실패 → `null` = 그 프로젝트 건너뜀(소비재 태그와 같은 fail-closed, §7.1).
- 스위치: 리포 변수 `RELEVANCE_SKIP_QUALITY=off` 만 끈다(워크플로 env 추가, 기본 on). 로그 줄 `품질 표시(S12) — 대기열에서 뺌(후보 프로젝트의 미판정 N건)`.
- 셀프테스트: `scripts/prefilter-selftest.mjs` 119 → 128건(cq-v1 promo 유지, 버전 무관 플래그, 스위치, pendingFor·countFor 제외, 판정된 글 미집계, off 원복, 표 없음 원래대로, 조회 실패 null).

## 검증

- 셀프테스트(로컬): analyze-llm-budget 37 · prefilter 128 · session-guard 163(정적 검사를 `const runKey =` 형태도 받게 한 줄 수정) · analyze-relevance 136 · consumer-material 47 · relevance-judge-all 97 · relevance-rating-sample 39 · llm-provider · second-opinion · cron-watchdog 93 전부 통과. `tsc --noEmit` 오류 0.
- 실제 DB 로 `--dry` 실행은 못 했다(서브에이전트, 서비스키 없음).

## 되돌리기

- PR revert. 또는 부분: `RELEVANCE_SKIP_QUALITY=off`(c) · 워크플로의 JUDGE_*_USD_CAP 두 줄 삭제해도 코드 기본 75·2000 이 남으므로 상한을 완전히 풀려면 revert.

## 오케스트레이터가 DB로 확인할 것

1. `agent_runs` 에서 `run_key LIKE 'relevance-second-2026-11-19%'` 의 status·summary — `running` 으로 남았는지(위 부수 영향).
2. `review_relevance_verdicts` 에서 `second_judged_at` 이 2026-11-19 01:12Z~02:31Z 인 행 수 — 2차가 죽기 전까지 몇 건 기록했는지(진척 속도로 러너가 끊긴 시점의 묶음 번호 추정).
3. `content_quality_flags` 의 flag·rule_ver 별 건수와, 그중 아직 판정 없는 글 수 — 머지 뒤 첫 실행 로그의 "품질 표시 … N건" 과 맞는지.
4. `agent_runs` 의 `relevance-judge-*`·`relevance-second-*` 이번 달 `summary.est_usd` 합 — 새 로그 줄 `과금 상한 — 오늘 … 이번 달 …` 과 맞는지.
