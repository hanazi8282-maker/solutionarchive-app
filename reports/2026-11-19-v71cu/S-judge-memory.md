# S-judge-memory — 2차 판정 원문 묶음 처리 · 메모리 피크 기록 · 월 퓨즈 변수 정리 (v71cu-4)

작성 2026-11-19 · 서브에이전트(DB·서비스키 없음, 실제 DB 실행 못 함) · 브랜치 `feat/v71cu-judge-memory`

배경: 11-19 00:57Z Nightly Relevance Judge 2차 스텝이 `hosted runner lost communication` 으로 죽었다(S12-budget.md (b)).
`JUDGE_DAILY_ITEMS_SECOND` 가 1,000→5,000 으로 처음 오른 실행이었다. 추정 원인은 메모리 압박:
2차가 후보 약 6.5만 행의 원문을 통째로 Map 에 올린 **뒤** 영역 밖 약 4만 행을 버렸다.

## 1. 2차 판정 구조 (scripts/relevance-second-judge-auto.mjs)

**전:** 후보(메타) → 프로젝트 → **대상 전부의 원문을 100행씩 읽어 한 Map 에 쌓음(약 6.4만 행)** → 영역 밖 제외 → 정렬·상한 → 판정. 원문 Map 은 스텝 끝까지 살아 있었다.

**지금:**
1. 후보는 지금처럼 id·메타만(`input_id, project_id, verdict, model, …` — 원문 없음).
2. 영역 밖(out-*) 제외와 주제 라벨 경로를 **id 단계**에서 한다.
3. 대기 전체를 한 번 정렬한다(`orderSecondTargets(queue, …, queue.length)` — 같은 순서 규칙, 상한만 뒤로 미룸).
4. 정렬된 순서대로 `RAW_CHUNK=1000` 행씩 원문을 읽는다 → 폐기·빈 원문·못 읽음을 센다 → 살아 있는 행을 상한까지 고른다 → 20건 묶음으로 판정하고 행마다 바로 저장한다 → 원문 Map 을 버리고 다음 묶음.
5. 살아 있는 원문이 `MAX` 건 모이면 원문 읽기도 멈춘다. 원문을 아예 안 본 행 수가 `remaining`(내일 몫)이다.
6. 원문 묶음마다 로그 한 줄: `원문 묶음 N: 1000행 확인 · 이번 묶음 고름 k · 누적 x/MAX · 기록 r · rss NMB`. 러너째 죽으면 exit 훅이 못 돌기 때문에 이 줄의 마지막 값이 죽기 직전 추세다.
7. 끝에 `메모리 피크 NMB (2차 판정, 종료코드 c)` 한 줄을 로그와 `GITHUB_STEP_SUMMARY`(워크플로 요약)에 남긴다. die(2)·저장 실패(3)로 끝나도 찍힌다. `agent_runs.summary.mem_peak_mb`·`max`·`raw_chunk` 에도 기록한다.

메모리 상한(추정): 한 번에 들고 있는 원문은 최대 1,000행. 대기 메타(약 2.4만 행 × 작은 객체)는 남지만 원문의 수십 분의 1이다. 후보 배열(약 6.5만 행)은 정렬 뒤 비운다.

바뀐 동작(같은 규칙, 다른 시점):
- 영역 그룹 "대기 전체" 수는 원문 확인 전(프로젝트가 있는 대상) 기준이다. 전에는 폐기 제외 뒤 기준이었다.
- 폐기 수(`purged`)는 실제로 원문을 확인한 범위 안의 수다(전에는 대상 전체).
- 주제 라벨 경로(`RELEVANCE_SECOND_TOPIC_DAILY`)는 원문 확인 전에 상한만큼 고른다 → 그중 폐기된 글이 있으면 그 경로 실건수가 상한보다 적을 수 있다(전에는 살아 있는 글에서 상한만큼).
- 원문 조회 실패: 전에는 판정 전 die(2). 지금은 판정 도중일 수 있어 `blocker` 로 멈추고 agent_runs 를 blocked 로 닫는다(--dry 에선 그대로 die).
- `--dry` 도 원문을 묶음 단위로 읽어 폐기 여부까지 보고 끝낸다(LLM·DB 쓰기 없음, 전과 같음).

## 2. 1차 판정 (scripts/relevance-judge-auto.mjs)

같은 통째 적재 패턴은 **없다.** 1차는 `countFor`(id·source_key 만)로 후보 수를 세고, 원문은 `pendingFor` 가 이번에 돌 프로젝트 하나씩 읽고 버린다(`lib/analysis/relevance-pending.ts`).
구조는 건드리지 않고 메모리 피크 한 줄(`메모리 피크 NMB (1차 판정, …)`)과 `summary.mem_peak_mb` 만 더했다.
남은 위험: 한 프로젝트의 원문(이미 판정된 글 포함)을 전부 읽는다 — 아주 큰 프로젝트(HN 수만 행) 하나가 피크를 만든다. 피크 줄이 생겼으니 그 값을 보고 필요하면 그때 프로젝트 안 페이지 처리를 한다.

## 3. 상한 단계(1,000→2,500→5,000) 판단 근거 — 코드는 단계를 올리지 않는다

- `JUDGE_DAILY_ITEMS_SECOND` 읽는 방식 그대로(워크플로 `RELEVANCE_SECOND_MAX: vars.JUDGE_DAILY_ITEMS_SECOND || …`). 코드에서 MAX 를 바꾸는 곳은 기존 용량 가드(내리기)뿐이다.
- 시작할 때 직전 2차 실행 한 줄(로그 + 워크플로 요약):
  `이전 2차 실행 — <run_key> · 시작 … · 상태 ok|partial|blocked (정상 종료) | running(끝나지 않음 = 비정상 종료 의심) · 상한 … · 고름 … · 메모리 피크 …MB · 이번 상한 …`
  - 이 기능 전 실행은 상한·피크가 `기록 없음` 으로 나온다. 조회 실패는 `확인 불가` 로 적고 판정은 계속한다(판정과 무관한 정보라서).
- 끝에 `2차 판정 — 상한 · 고름 · 기록 · 상태 · 멈춤 사유` 한 줄을 워크플로 요약에.
- 단계 올리기 판단 제안(오케스트레이터용):
  - 올림 조건: 직전 실행이 정상 종료(running 아님) ∧ 메모리 피크가 러너 메모리(ubuntu-latest 16GB, 공개 리포 표준 러너)의 25% 미만(≈4,000MB) ∧ 시간 상한(`time_capped`)에 안 걸림 ∧ 상한까지 다 고름(`picked = max`, 즉 대기가 남아 있음).
  - 시간 판단: 11-18 상한 1,000 → 2차 57분. 묶음 속도가 같다면 2,500 ≈ 140분, 5,000 ≈ 285분이다. 스크립트 마감(`RELEVANCE_SECOND_DEADLINE_MIN` 150분)·스텝 timeout 165분이 먼저 걸린다 → **5,000 은 메모리와 무관하게 하루 한 실행에 다 못 한다.** 2,500 이 한 실행의 실질 천장이고, 그 이상은 슬롯을 나눠야 한다(추정 — 묶음당 시간은 11-18 한 번의 실측에서 나눈 값).

## 4. LLM_MONTHLY_CAP_USD(450) · LLM_MONTHLY_ALARM_USD(340)

**실측:** 리포 전체(lib·scripts·app·.github)에서 두 이름을 읽는 곳 0. 문서 언급은 S12-budget.md 한 줄뿐이다.

**제안: 제거(변수 삭제).** 배선하지 않았다. 근거:
1. 같은 역할을 `JUDGE_MONTHLY_USD_CAP`(2,000, #683)이 이미 원장(agent_runs `summary.est_usd`)으로 하고 있다. 판정 쪽 과금 경로는 사실상 2차(gemini)뿐이다 — 1차는 claude-cli(구독, 계량 불가). extract·번역 등 판정 밖 호출은 어느 월 상한에도 안 들어가는데, 그 경로가 과금인지(구독인지)는 이번에 확인하지 않았다 — 월 퓨즈를 그쪽까지 넓히려면 원장 접두어(`JUDGE_RUN_PREFIXES`)를 넓히는 게 순서다.
2. 450 을 배선하면 기존 2,000 보다 4배 이상 낮은 두 번째 월 상한이 생긴다. 남헌 v71cu-4("비용은 고려하지 않는다, 상한은 폭주 방지 퓨즈") 와 방향이 반대다.
3. 같은 뜻의 변수 두 벌은 S0.md 가 경고한 "이름이 갈라지는" 문제를 다시 만든다.
- 남겨야 한다면: ALARM 만 `judgeBudgetGate` 줄에 `월 합 ≥ ALARM → warn` 한 줄로 붙이는 게 가장 작다(멈추지 않는 경보). 이번 PR 엔 안 넣었다.

**최근 실사용(리포 기록에서 읽은 값 — DB 직접 조회는 못 함):**
- 10-14 정기 2차: 선정 200 · 기록 180 · est **$0.168** → 행당 약 **$0.00093**, 20건 묶음당 약 $0.019 (reports/2026-10-14/audit-grading-and-shadow-rejudge-v71.md).
- 이 단가로 환산: 1,000건/일 ≈ $0.93/일 ≈ $28/월 · 2,500건/일 ≈ $2.3/일 ≈ $70/월 · 5,000건/일 ≈ $4.7/일 ≈ $140/월.
- 금액은 budget.ts 추정치(2자=1토큰, 보수 단가)라 실청구보다 크게 잡힌다. Gemini 무료 티어면 실청구는 0일 수 있다.

**퓨즈 제안값:** 현행 `JUDGE_DAILY_USD_CAP=75` · `JUDGE_MONTHLY_USD_CAP=2000` 유지.
- 일 $75 = 최대 단계(5,000건/일) 추정 $4.7 의 약 16배, 현재 1,000건 단계의 약 80배.
- 월 $2,000 = 5,000건/일 × 30일 추정 $140 의 약 14배.
- 정상 운영에서 절대 닿지 않고, 프롬프트 폭주(같은 행 무한 재시도·원문 수십 배 길어짐) 같은 10배 이상 이상치에서만 걸린다 → 퓨즈 정의에 맞는다. 값은 바꾸지 않았다.
- ⚠️ 별개로 프로세스 상한 `LLM_DAILY_BUDGET_USD`(워크플로 기본 '5', S12 기준 리포 변수 $15)가 있다. 5,000 단계 추정 $4.7 은 기본값 $5 와 붙어 있으니 변수 값이 실제로 15 인지 확인할 것.

**오케스트레이터가 실사용을 읽는 쿼리 예시** (SQL Editor 또는 MCP execute_sql, 읽기 전용):

```sql
-- 판정 실행의 KST 일별 합계(최근 35일). running 은 tracker.finish 전에 죽은 실행 = est_usd 없음.
select (started_at at time zone 'Asia/Seoul')::date as kst_day,
       split_part(run_key, '-2', 1) as kind,            -- relevance-judge / relevance-second
       count(*) as runs,
       count(*) filter (where status = 'running') as unfinished,
       round(sum(coalesce((summary->>'est_usd')::numeric, 0)), 4) as est_usd,
       sum(coalesce((summary->>'recorded')::int, 0)) as recorded,
       max((summary->>'mem_peak_mb')::int) as mem_peak_mb
from agent_runs
where (run_key like 'relevance-judge-%' or run_key like 'relevance-second-%')
  and started_at >= now() - interval '35 days'
group by 1, 2 order by 1 desc, 2;

-- 월 합(KST 달)
select date_trunc('month', started_at at time zone 'Asia/Seoul') as kst_month,
       round(sum(coalesce((summary->>'est_usd')::numeric, 0)), 2) as est_usd
from agent_runs
where run_key like 'relevance-judge-%' or run_key like 'relevance-second-%'
group by 1 order by 1 desc;
```

코드에서 읽는 방법은 이미 있다: `loadJudgeLedgerRows(sb, now)` → `judgeLedgerFrom(rows, now, DAILY_BUDGET_USD)` 가 `{ todayUsd, monthUsd, openToday, openMonth }` 를 준다(lib/analysis/budget.ts). 2차 실행 로그의 `과금 상한 — 오늘 추정 $… · 이번 달 $…` 줄이 그 값이다.

## 검증

- 셀프테스트(로컬, 순차 실행): relevance-second-judge 78(새 8건: 원문 조회 한 곳 · 영역 밖 제외·정렬 뒤 · 1,000행 루프 안 · 묶음마다 새 Map · rss/피크/summary · 직전 실행 줄·상한 불변 · toMb · memPeak) · analyze-llm-budget 37(2차 배선 정규식을 새 루프에 맞게 갱신) · analyze-relevance 136 · auto-approval 75 · session-guard 163 · untrusted-input 77 · analyze-extract-auto 154 · analyze-extract-select 44 · areas 67 · relevance-judge-all 97 · relevance-rating-sample 39 · youtube-videos 26 — 전부 0 fail. `node --check` 두 스크립트 통과.
- 실제 DB 로 `--dry` 나 본 실행은 못 했다(서브에이전트, 서비스키 없음). 실제 메모리 감소폭은 머지 뒤 첫 실행의 `메모리 피크` 줄로만 확인된다.

## 되돌리기

PR revert(마이그레이션·변수 변경 없음). 메모리 기록만 남기고 싶으면 `scripts/mem-peak.mjs` 와 호출 두 줄은 독립적이다.

## 오케스트레이터가 DB·러너에서 확인할 것

1. 머지 뒤 첫 Nightly Relevance Judge: 2차 스텝 로그의 `원문 묶음 N … rss` 추세와 요약의 `메모리 피크 …MB`(1차·2차 둘 다). 상한 1,000 에서 몇 MB 인지가 단계 판단의 기준선이다.
2. 같은 실행의 `이전 2차 실행 —` 줄: 11-19 실행(`relevance-second-2026-11-19*`)이 `running(끝나지 않음)` 으로 보이는지 — S12 의 부수 영향 확인과 같은 것.
3. 위 SQL 로 최근 2차 행당 est_usd 를 다시 계산해 이 보고서의 $0.00093/행(10-14 한 번)이 아직 맞는지.
4. 리포 변수 `LLM_DAILY_BUDGET_USD` 실제 값(15 인지). 5,000 단계에서 기본 5 면 프로세스 상한이 먼저 걸린다.
5. `LLM_MONTHLY_CAP_USD`·`LLM_MONTHLY_ALARM_USD` 삭제 여부 결정(이 보고서는 제안만, 변수는 그대로).
