# 자동화 안정화 장치 3종 설계 — A 심장박동 · B 흐름 제어 · D 소스 카나리 (남헌 v71al §3)

작성: CTO 역할 세션, 2026-10-17 KST. 기준은 origin/main 89e3c98(#571).
이 문서는 설계만 담는다. 구현은 승인 뒤 별도 PR 로 한다.
DB 접근 0(서비스키·MCP 안 씀). 근거는 코드, 리포 변수(`gh variable list`), Actions 실행 이력(`gh run list`/`gh run view`)이다.
라벨: [실측] = 코드·변수·실행 이력으로 확인 · [추정] · [확인 불가].

## 공통 결론

- 새 cron 워크플로는 셋 다 0개다. A 는 이미 30분마다 도는 `collect-gap-watchdog.yml` 에, B·D 는 기존 야간 워크플로 안에 붙인다.
- 세 장치 모두 이미 있는 부품을 재사용한다. 새로 짓는 건 각각 "빠진 한 조각"뿐이다.
- 비용 전제 정정 [실측]: `gh repo view` 결과 리포 공개 범위는 **PUBLIC** 이다. CLAUDE.md §2 도 "Actions 분 무료 때문에 의도적 공개, 실배포 때 비공개 전환"이라고 적는다. 지시서의 "비공개, Actions 분이 곧 비용"과 다르다.
  - 지금은 표준 러너 분이 무료다. 아래 분 계산은 "비공개로 바꿨을 때(월 2,000분 한도)" 기준으로 적는다. 세 설계 모두 그 전환 뒤에도 버티게 잡았다.
  - 비공개로 바꾸면 이미 가장 큰 고정비는 공백 감시자다. 하루 48회, 회당 실제 0.2분이지만 과금은 잡당 1분 올림이라 월 약 1,440분이다 [추정 — 과금 규칙 기준].

---

## A. 심장박동·죽은 사람 스위치 (1쪽)

**한 줄 결론:** 새로 만들 것은 두 조각뿐이다. ① 공백 감시자에 "좁은 범위의 빨간불 1회 재실행" ② 감시자끼리 서로 살아 있는지 보기. 알림은 새로 만들지 않고 기존 Notion 일일 로그 경로를 쓴다.

**지금 있는 것과 하는 일 [실측]**
- `collect-gap-watchdog.yml`(30분마다, 11·41분): 수집 330분, 판정 840분 넘게 새 실행이 없으면 dispatch 1회. `GAP_WATCHDOG_DRY=false` 라 실제로 건다. "안 돌았다"는 이미 잡는다.
- `cron-watchdog.yml`(하루 1회 21:53Z): 슬롯마다 schedule 실행이 있고 success 인지 본다. 이상이면 Notion "일일 상태 로그" CTO 행 + 실행 실패(Actions 메일). "빨간불 알림"은 이미 있다.
- `relevance-resume.yml`: 수동 실행 전용, 매번 남헌 승인 필요. 무인 장치가 아니므로 A 와 겹치지 않는다.
- `nightly-relevance.yml` r1(02:03Z): 정규 실행이 구독 한도로 멈췄을 때만 재시도. 그 밖에는 기록 없이 끝난다. 일반 빨간불 재실행이 아니다.
- `nightly-relevance.yml` relaunch job: 체인을 잇는 장치. 실패한 실행은 잇지 않는다.

**빈틈 [실측]**
- 빨간불을 다시 돌리는 장치가 없다. 최근 60회 실행 전부 attempt 1 이다(재실행 0회).
- 감시자를 감시하는 장치가 없다. `cron-watchdog.mjs` 는 자기 자신을 빼고, 30분 크론(`FREQUENT_CRON`)도 뺀다. 둘 중 하나가 멈추면 조용하다(파일 주석의 ponytail 이 이미 인정).
- 공백 감시자가 걸어 준 회복 실행(workflow_dispatch)은 아침 감시가 slot 몫으로 세지 않는다(`event=schedule` 만 셈). 회복돼도 "미발화" 경보가 뜬다 — 소음이다.

**빨간불 재실행을 좁게 잡는 이유 [실측]**
- 최근 8일 수집 실패 9회 중 확인한 4회의 실패 스텝은 전부 "Collect reviews" 였다.
- 10-16 20:01Z 실행의 원인: `github_issues`·`stackexchange` 의 실행 로그 INSERT 가 FK 위반(마이그 미적용 상태로 소스가 선택지에 들어옴). 나머지 소스는 정상 수집했다.
- 이런 "소스 일부 실패"는 다시 돌려도 같은 결과다. 재실행은 분만 쓴다. 그 소스만 거르는 일은 D 가 맡는다.
- 판정은 최근 60회 중 실패 0회다.

**설계**
- 재실행 조건(모두 만족해야 1회): 두 워크플로 각각 가장 최근 끝난 실행이
  - conclusion 이 `failure` (사람이 누른 `cancelled` 는 제외)
  - attempt 가 1 (두 번째는 절대 안 건다 — 루프 방지)
  - 시작 6시간 이내, 그 뒤에 더 새 실행(진행·대기·성공)이 없음
  - 실패 스텝이 기반 스텝뿐: Set up job · checkout · setup-node · npm ci · Install Claude Code CLI · Mint bot token · push-pending 의 commit/push
- 그러면 `gh run rerun <id> --failed` 1회 + STEP_SUMMARY 한 줄. "Collect reviews"·"Judge" 스텝 실패는 재실행하지 않는다.
- 다시 실패하면: 따로 알림 코드를 만들지 않는다. 아침 cron-watchdog 가 그 실행을 `failure` 로 읽어 Notion CTO 행을 쓴다. 재실행이 성공하면 같은 실행의 결론이 success 로 바뀌어 경보가 안 뜬다 [추정 — 가정 1].
- 감시자끼리 보기:
  - 공백 감시자에 `check cron-watchdog.yml 1560`(26시간) 한 줄. 아침 감시가 안 돌았으면 1회 건다.
  - cron-watchdog 에 "공백 감시자의 마지막 실행이 2시간보다 오래됐으면 이상" 한 줄.
- 회복 실행 소음 줄이기: cron-watchdog 가 슬롯 창 안의 `github-actions[bot]` dispatch 실행도 그 슬롯 몫으로 센다. 다만 줄 끝에 "(공백 감시자 회복)"을 붙여 사실은 남긴다.

**알림 경로: Notion 일일 로그(기존 cron-watchdog 경로) 하나로 고른다**
- 이미 매일 돌고, 아침 브리핑(07:00 KST)이 읽는 자리다. Notion 기록 실패 시 대기 파일 + flush 폴백도 이미 있다.
- 메일은 따로 짤 필요가 없다. cron-watchdog 가 이상일 때 exit 1 이라 GitHub 실패 메일이 덤으로 간다.
- 새 메일 발송(SMTP 등)은 새 자격증명이 필요하다. 헌장상 에스컬레이션 대상이라 고르지 않는다.

**구현 PR 범위·예상 파일·셀프테스트·롤백**
- 범위: 재실행 분기, 감시자끼리 보기 두 줄, 회복 실행 세기.
- 예상 파일: `.github/workflows/collect-gap-watchdog.yml` · `scripts/gap-watchdog-selftest.mjs` · `scripts/cron-watchdog.mjs` · `scripts/cron-watchdog-selftest.mjs`
- 새 변수: `GAP_WATCHDOG_RERUN`(미설정 = 걸 것만 로그, `true` 일 때만 실제 재실행). 지금 `GAP_WATCHDOG_DRY=false` 라 같은 변수를 쓰면 머지 즉시 실제 재실행이 켜지므로 따로 둔다.
- 셀프테스트(정적·네트워크 없음): attempt≥2 면 안 건다, `cancelled` 면 안 건다, 실패 스텝이 "Collect reviews" 면 안 건다, `GAP_WATCHDOG_RERUN` 이 `true` 가 아니면 `gh run rerun` 이 실행되지 않는다, `actions: write` 는 job 안 한 번뿐. cron-watchdog 쪽은 가짜 실행 목록으로 "bot dispatch 가 슬롯을 메운다 / 사람 dispatch 는 못 메운다", "공백 감시자 마지막 실행 3시간 전 → 이상".
- 롤백: `GAP_WATCHDOG_RERUN` 삭제(즉시 로그 전용) · 전체 끄기는 기존 `GAP_WATCHDOG_ENABLED=false` · 코드는 PR revert.

---

## B. 흐름 제어(백프레셔) (1쪽)

**한 줄 결론:** 상태를 저장하지 않는 계산 스크립트 하나(`scripts/flow-control.mjs`)를 판정·공급 워크플로의 **앞** 스텝에서 매번 돌려, "판정 대기 며칠치" 구간에 따라 그 실행에서만 쓸 실효값을 낸다. 리포 변수는 바꾸지 않는다.

**왜 앞 스텝이고 상태 없음인가**
- 끝 스텝에서 계산하면 다음 실행에 넘길 저장소가 필요하다. 저장소는 리포 변수 쓰기다. 기본 `GITHUB_TOKEN` 은 리포 변수를 못 쓴다고 본다 [추정 — 가정 3]. 봇 앱 토큰에 그 권한을 더하는 건 자격증명 변경이라 고르지 않는다.
- 앞 스텝에서 계산하면 그 실행에 바로 반영되고, 대기가 줄면 다음 실행부터 저절로 원래 값으로 돌아온다. 되돌리기 코드가 따로 필요 없다.
- 새 cron 0개. 계산은 하루에 판정 2~3회 + 체인 hop, 공급 워크플로마다 1회씩 돈다("매일 계산"을 넘는다).

**재료 — 읽기 SQL(문서에 적기만 한다, 이번에 실행하지 않음)**
```sql
-- B-1 판정 대기: 판정 스크립트가 직접 센 값을 그대로 읽는다(산식 한 벌 — relevance-judge-auto.mjs).
select run_key, started_at, status, (summary->>'unjudged_after')::int as backlog
from public.agent_runs
where run_key like 'relevance-judge-%' and summary ? 'unjudged_after'
order by started_at desc
limit 1;

-- B-2 하루 수집량(최근 7일 평균, 실제 적재만)
select round(sum(new_reviews) / 7.0) as inflow_per_day
from public.review_collection_runs
where dry_run = false and started_at >= now() - interval '7 days';

-- B-3 하루 판정량(최근 7일 평균, 참고용 — 규칙에는 안 씀)
select round(count(*) / 7.0) as judged_per_day
from public.review_relevance_verdicts
where judged_at >= now() - interval '7 days';
```
- 며칠치 D = backlog ÷ inflow_per_day (지시서의 "수집량 대비"). inflow 가 0 이고 backlog>0 이면 D = 무한대(넘침 쪽).
- 하나라도 못 읽으면 "확인 불가": 모든 값을 리포 변수 그대로 쓰고 경보 한 줄. 모르는 것을 늘리는 쪽으로 접지 않는다(§7.1).
- 지금 D 값은 [확인 불가] — DB 를 안 읽었다. 첫 가동은 dry 로 값만 본다.

**규칙(구간) — 어제 상태를 기억하지 않는다**
- 확인 불가 → 판정·공급 모두 변수값 그대로
- D < 1일 → 공급 한 단계 올림, 판정 그대로
- 1일 ≤ D ≤ 3일 → 둘 다 변수값 그대로
- 3일 < D ≤ 6일 → 공급 확대 멈춤(위 "올림"이 꺼짐) + 판정 한 단계 올림
- D > 6일 → 판정은 천장 + 공급 한 단계 내림
- 한 단계 = 변수값의 ±50%(정수 내림), 천장·바닥에서 자른다. 누적하지 않는다 — 늘 변수값에서 한 단계만 움직인다.

**손잡이 — 이름 · 기준 · 올림 천장 · 내림 바닥 · 되돌리기**
- 판정 `RELEVANCE_CHAIN_MAX_HOPS` · 변수(미설정 24) · `FLOW_HOPS_CEIL`(미설정 = 기준 → 자동 올림 없음, 코드 완화값 60 이 참고 천장) · 내리지 않음 · `FLOW_CONTROL=off`
- 판정 `RELEVANCE_SECOND_MAX` · 8000 [실측] · `FLOW_SECOND_CEIL`(미설정 = 기준) · 내리지 않음 · 같음. 주의: 한도 대장 §6 에서 4000→8000 도 마감·$ 캡이 먼저 막아 효과 0이었다. 올려도 소용없을 수 있다.
- 공급 `WINDOW_MAX_REQUESTS` · 120 [실측] · `min(FLOW_WINDOW_CEIL, 코드 천장 160)` · 80(코드 기본값) · 같음
- 공급 `TARGET_CLOCK_INCREMENTAL_MAX` · 20 [실측 — 한도 대장] · `TARGET_REVIVE_TOTAL_CEILING`(미설정 40) · 5(코드 기본값) · 같음
- 공급 `DISCOVERY_TARGET_MAX` · 200 [실측] · **올리지 않음**(헌법 §10.1 의 남헌 값) · 내림만, 바닥 5(기존 롤백값) · 같음
- 자동 대상 아님: `LLM_DAILY_BUDGET_USD`(돈 = 남헌), 세션 캡 `config/session-guard.json`(남헌 파일), 각 job 의 timeout(마감 변수는 지금 80+150+40=270분으로 timeout 여유 0).

**규칙 변수(전부 리포 변수, 한도 대장 §1-4 로 새로 기록)**
- `FLOW_CONTROL` — `off`(미설정과 같음) / `dry`(계산·로그만) / `on`
- `FLOW_HIGH_DAYS` 3 · `FLOW_LOW_DAYS` 1 · 넘침 구간은 HIGH 의 2배(6)로 코드에서 계산
- `FLOW_STEP_PCT` 50
- `FLOW_HOPS_CEIL` · `FLOW_SECOND_CEIL` · `FLOW_WINDOW_CEIL` — 미설정이면 자동 올림 없음. 남헌이 천장을 열어야 올림이 시작된다.

**비용 메모(비공개 기준)**
- 체인 hop 1개 ≈ 판정 실행 1회. 최근 60회 평균 47분 [실측]. 리눅스 분당 $0.008 로 hop 하나 약 $0.38 [추정].
- 그래서 `FLOW_HOPS_CEIL` 은 분 비용과 구독 한도 둘 다 쓰는 손잡이다. 미설정(자동 올림 없음)으로 출하한다.

**구현 PR 범위·예상 파일·셀프테스트·롤백**
- 범위: 계산 스크립트, 3개 워크플로의 앞 스텝, 손잡이 env 줄을 `${{ steps.flow.outputs.X || vars.X || '기본' }}` 꼴로 교체, 한도 대장 §1-4.
- 예상 파일: `scripts/flow-control.mjs`(순수 함수 `flowDecision` + 읽기 3개) · `scripts/flow-control-selftest.mjs` · `.github/workflows/nightly-relevance.yml` · `.github/workflows/nightly-window-discovery.yml` · `.github/workflows/nightly-review-collect.yml`(target-revive 스텝 env 한 줄 + Notion 게이지 블록에 흐름 한 줄) · `.github/workflows/build-check.yml`(셀프테스트 한 줄) · `reports/2026-10-17/cap-registry.md`
- 보호 파일 주의: `nightly-review-collect.yml` 은 기존 셀프테스트가 "보호 파일"로 다룬다(`scripts/gap-watchdog-selftest.mjs`). env 한 줄 교체라도 합의가 필요하다. 합의가 안 되면 그 손잡이(`TARGET_CLOCK_INCREMENTAL_MAX`)만 빼고 출하한다.
- 셀프테스트: 구간 경계 0.99/1/3/3.01/6/6.01일, 확인 불가 → 변수 그대로, inflow 0, 천장 미설정이면 올림 0, `DISCOVERY_TARGET_MAX` 는 어떤 D 에서도 200 을 넘지 않음, `FLOW_CONTROL` 미설정이면 출력이 전부 빈칸(= 워크플로가 변수값을 씀).
- 롤백: `FLOW_CONTROL` 삭제 → 모든 스텝이 오늘과 같은 `vars.X` 를 쓴다. 코드는 PR revert.

---

## D. 소스 카나리 (1쪽)

**한 줄 결론:** "그 소스만 잠깐 쉬기 + 며칠 뒤 다시 시도 + 로그"는 이미 `soft-skip` 이 DB 쓰기 없이 하고 있다. 빠진 신호 둘(빈 파싱 연속, 오류 응답 비율)만 같은 자리에 더한다. 새 컬럼·마이그레이션 없이 기존 `review_collection_runs` 칸으로 계산된다.

**지금 있는 것 [실측]**
- 차단(403/429/WAF/캡차): 러너가 첫 응답에서 그 소스를 끊는다(`lib/review/runner.ts` runCollection). 램프는 한 단계 내리고 3일 동결(`lib/review/ramp.ts` rollbackOnBlock). `HALT_ON_BLOCK_SOURCES` 8곳은 다음 실행부터 사람이 켤 때까지 건너뛴다.
- 구조 변경(파싱 성공률 < 80%, 표본 10 이상): `health.ts` judgeHealth 가 broken. 3회 연속이면 `latest-health.ts` softSkipDecision 이 건너뛰고 3일 뒤 1회 재시도. DB 쓰기 0.
- 요청 0(24시간, 사유 없음): cron-watchdog 아침 경보.
- 고장 보고: `review-source-health-report.mjs` → Notion CTO 행.
- `scripts/block-stop.mjs`(enabled=false, `override='owner_2026-10-14'` 소스만): 코드는 있으나 워크플로에 배선 안 됨(파일 주석).

**빈틈 [실측]**
- 빈 파싱: 페이지는 받았는데 파서가 0개를 내면(파싱 0 · 실패 0) judgeHealth 는 "수집할 타깃이 없었다"로 **ok** 를 준다(`health.ts` judgeHealth 마지막 분기, attempted=0). 3회째부터 degraded 일 뿐 soft-skip 대상이 아니다. 선택자가 바뀐 구조 변경이 가장 조용하게 숨는 자리다.
- 오류 응답 비율: 403/429 가 아닌 4xx·5xx·네트워크 오류는 그 타깃만 failed 로 끝나고 실행 행에 따로 세는 칸이 없다. 그래도 기존 칸으로 계산된다(차단·쿼터는 페이지 수에 안 들어가고, 404 건너뜀은 들어간다 — runner.ts 확인):
  - 오류 응답 수 ≈ requests − pages_fetched − blocked_responses − quota_responses
- 차단 정지를 DB 로 하는 건 `owner_2026-10-14` 소스만 헌법 예외다. 그 밖의 소스는 무인 루프가 `review_sources` 를 못 쓴다(CLAUDE.md §10.1). 그래서 D 의 "일시정지"는 soft-skip(건너뛰기)이다. DB 쓰기를 늘리지 않는다.

**신호와 판정(소스별 최근 비-dry-run 실행 기준)**
- S1 빈 파싱 연속: `requests>0 ∧ pages_fetched>0 ∧ reviews_parsed=0 ∧ parse_failures=0` 이 최근 3회 연속 → 구조 변경 의심, 건너뜀
- S2 오류 비율: 위 식 ÷ requests ≥ 50%, requests ≥ 10, 최근 2회 연속 → 건너뜀
- S3 쿼터 응답(429 중 쿼터)은 신호가 아니다 — 내일 풀리는 정상 소진이다(judgeHealth 3번과 같은 이유)
- 확인 불가(칸 null·조회 실패) → 지금처럼 돈다
- 재시도 일정: 마지막 이상 실행이 3일(`SOFT_SKIP_RETRY_DAYS`) 지나면 한 번 통과. 또 이상이면 다시 3일. `--source=<키>` 로 이름을 적은 수동 실행은 건너뛰지 않는다(고친 뒤 확인 경로, 기존 규칙)
- 로그: 건너뛴 이유가 Actions 요약과 Notion CTO 행 "한일" 칸에 이미 실린다(`sourceResults.skipReason`, review-collect.mjs). 새 기록 경로 없음

**어디에 꽂나**
- 보호 파일을 안 건드리는 안(권장): 새 파일 `scripts/source-canary.mjs` 에 순수 함수 `canaryDecision(runs)` + 최근 3행 읽기. `scripts/review-collect.mjs` 의 soft-skip 자리(현재 263행 `loadSoftSkip` 호출 바로 뒤)에서 한 번 부르고, skip 이면 같은 방식으로 `continue`. 기준 상수는 `health.ts` 에서 import 만 한다(값 두 벌 금지).
- 보호 파일 표시(수정하지 않음, 합의되면 옮길 자리):
  - `lib/review/latest-health.ts` · `softSkipDecision` — S1·S2 규칙의 원래 자리. `loadSoftSkip` 의 select 에 `requests, pages_fetched, quota_responses` 를 더해야 한다
  - `lib/review/health.ts` · `judgeHealth` 마지막 분기 — `attempted===0` 인데 페이지를 받았으면 "타깃 없음 ok" 가 아니라 degraded 여야 맞다. 판정 문구가 사람을 오도한다
  - `lib/review/runner.ts` · runCollection 의 `res.status >= 400` 분기 — 오류 응답을 칸으로 세면(예: `error_responses`) 위 근사식이 필요 없어진다. 그러려면 마이그레이션도 필요하다. 이번 설계는 근사식으로 충분하다고 본다
- 하지 않는 것: `block-stop.mjs` 배선, `review_sources.enabled` 쓰기, 새 컬럼

**구현 PR 범위·예상 파일·셀프테스트·롤백**
- 범위: 카나리 함수 1개, review-collect.mjs 호출 한 곳, 셀프테스트.
- 예상 파일: `scripts/source-canary.mjs` · `scripts/source-canary-selftest.mjs` · `scripts/review-collect.mjs`(호출 5줄 안팎) · `.github/workflows/build-check.yml`(셀프테스트 한 줄)
- 셀프테스트: 가짜 실행 행으로 "빈 파싱 2회 → 돈다 / 3회 → 건너뜀 / 3일 지나면 1회 돈다", "오류 비율 49% → 돈다 / 50%·requests 10 이상·2연속 → 건너뜀 / requests 9 → 돈다", "쿼터만 있으면 돈다", "칸 null → 돈다(확인 불가)", "명시 실행(`--source=`)은 건너뛰지 않는다", 쓰기 함수가 import 되지 않음(DB 쓰기 0 고정).
- 새 변수: `SOURCE_CANARY`(미설정 = 판정만 로그, `on` 일 때만 건너뜀). 첫 1주는 로그로 오탐을 본다.
- 롤백: `SOURCE_CANARY` 삭제(즉시 로그 전용) · 코드는 PR revert. 건너뛴 소스는 DB 에 흔적이 없어서 되돌릴 데이터가 없다.

---

## 코드로 확인하지 못한 가정

1. GitHub API 의 workflow run 결론은 마지막 시도(attempt) 기준이다 — 그래서 재실행이 성공하면 아침 감시가 초록으로 본다.
2. `actions: write` 를 가진 `GITHUB_TOKEN` 으로 `gh run rerun --failed` 가 된다.
3. 기본 `GITHUB_TOKEN` 은 리포 변수를 쓸 수 없다(B 를 상태 없음으로 설계한 이유).
4. `reviews_parsed` 는 중복 리뷰도 센다 — 그래서 S1 의 "파싱 0"은 정말 아무것도 못 읽은 것이다. 중복을 빼고 센다면 S1 은 "새 글 없음"과 섞여 오탐이 난다.
5. `new_reviews` 합이 판정 대기열 유입과 같다고 봤다. 실제로는 유튜브 제외·소비재 태그 보류·대상 아닌 프로젝트가 빠지므로 유입이 크게 잡히고 D 는 작게 나온다(공급을 덜 막는 쪽).
6. `agent_runs.summary.unjudged_after` 는 원문을 못 읽은 프로젝트를 빼고 센 하한이다(스크립트 주석). 실제 대기는 더 클 수 있다.
7. "보호 파일" 목록은 코드에 정의가 없다. `lib/review/*` 와 `nightly-review-collect.yml`(gap-watchdog 셀프테스트가 그렇게 다룸)을 보호 대상으로 보고 적었다.
8. 리포 공개 범위는 지시서(비공개)와 다르게 PUBLIC 이다(`gh repo view`·CLAUDE.md §2 둘 다). 분 비용 계산은 비공개 전환 뒤 기준 추정이고, 과금 규칙(잡당 1분 올림·분당 $0.008)은 이 리포에서 확인하지 않았다.
9. DB 현재값(대기 건수, 하루 유입, 소스별 최근 행)은 읽지 않았다. D·S1·S2 가 지금 몇 곳에 걸리는지는 확인 불가다.
10. 예약 실행 실패 메일은 cron 을 마지막으로 고친 사용자에게 간다는 GitHub 동작을 전제로 했다. 이 리포에서 누가 받는지는 확인하지 않았다.
