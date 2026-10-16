# 한도 대장(D-24) · 숨은 천장 둘 · 앱스토어 칸 회전 · 품질 방어선(D-48) · 2차 판정 8000 검토 — v71aj §3·§5

작성: CTO 역할 세션, 2026-10-17 KST. DB 접근 0(서비스키·MCP 안 씀). 근거는 main(0c5251b — #551·#568 머지 포함) 코드·리포 변수(`gh variable list`)·GitHub Actions 실행 로그뿐이다.
DB 값은 전부 "확인 불가"이고 CEO-staff 가 돌릴 읽기 SQL 을 붙였다. 라벨: [실측]=코드·변수·실행 로그로 확인 · [추정] · [확인 불가].

## 0. 요약

- 10-16 까지 실제로 일을 막은 한도는 넷이다 [실측]:
  - 창문 등재 하루 5. 5일 연속 등재 5건, `daily_cap` 에 잘린 채택분은 9·20·38·17·27건이다.
    10-16 18:47Z 에 변수 200 이 설정됐고 #551(env 화) 이 머지돼, 다음 실행(10-16 22:23Z 슬롯)부터 이 한도는 풀린다.
    그다음 병목은 요청 120 과 앱스토어 30% 게이트가 된다 [추정].
  - 창문 요청 80. 10-14~16 매일 `appstore=quota`(80/80)였다.
  - 구글 플레이 동결선 80. 활성 85 라 매일 `gate_blocked` 다.
  - 2차 판정 마감 40분. 최근 4회 중 3회가 94·144·171/200번째 묶음에서 멈췄다.
- 4000→8000 은 지금 효과가 0이다. 4000 상한에 걸린 실행은 4회 중 1회뿐이다. 마감(40분)과 1프로세스 예산 $5(≈5,376건)가 먼저 막는다(§6).
- 숨은 천장 (가) 지수 항은 실제로 막고 있다. 증분형 되살림 후보 179건 중 `revisit_not_due` 가 130건이다.
  (나) queue_full 은 2건뿐이라 지금은 작다. 둘 다 변수로만 풀리게 PR 에 넣었다(기본 = 현행).
- 앱스토어 "30% 칸 회전"은 전제가 지금 실측과 다르다. 10-16 로그 기준 앱스토어 활성은 0이다(연료계 `appstore 0일`).
  exhausted 155개는 30% 게이트에 안 잡힌다. 0건 타깃이 실제로 쓰는 것은 칸이 아니라 14일마다 오는 방문 슬롯이다(§3).
- 헌법과 실물이 어긋난 곳은 하나다(§7). 창문 강등은 앱스토어에서 구조적으로 한 번도 못 돈다(5/5 "이미 exhausted").
  `DISCOVERY_TARGET_MAX` "현재 200" 문구는 #551 머지와 변수 200 설정으로 10-16 18:47Z 부터 실물과 맞다.

## 1. 한도 대장 (D-24) — 항목당 한 줄

형식: 이름 — 현재값 · 코드 천장 · 바꾸는 주체 · 롤백. 바꾸는 주체는 남헌 / CC(대화형·역할 세션 자율) / 무인(루프가 스스로) 셋이다.

### 1-1. 타깃 공급·등재
- `DISCOVERY_TARGET_MAX`(리포 변수, #551 로 env 화) — 200 [실측, 10-16 18:47Z 설정] · 미설정 12 · 잘못된 값 5 · 천장 없음 · 남헌(헌법 §10.1 "현재 200") · 롤백 = 변수 5
  쓰는 곳은 셋이다: window-discovery 등재(소스당 KST 하루), board-discovery 후보, discovery-run 후보 수 min(gap, 이 값, 게이트 여유).
- `WINDOW_MAX_REQUESTS`(리포 변수) — 120 [실측, 10-16 15:56Z 설정] · 코드 천장 `MAX_REQUESTS_CEILING` 160 · CC(80→120→160 단계, v71ab C-3) · 롤백 = 변수 삭제(80)
- `DEFAULT_MAX_REQUESTS` — 80 · 위 변수가 비었을 때 · 코드 PR
- 창문 채택 문턱 `adopt_min_new_per_request` — 5(`config/window-probe.json`) · CC(설정 PR) · 롤백 = 파일 revert
- 창문 요청 간격 하한 `min_interval_ms_floor` — 3000ms · CC
- `DEMOTE_AFTER_DAYS` 창문 강등 — 3일(`scripts/window-discovery.mjs`) · 헌법 §10.1 문구 · 남헌 · 앱스토어에서는 사실상 작동 안 함(§7-2)
- `SHARE_GATE` 30% 게이트 — 0.3 · 남헌(v32 D3) · 코드 PR revert
- `GOOGLEPLAY_FROZEN_ACTIVE` — 80 · 실측 활성 85(10-14~16 로그 "active 85") · 남헌(올리기) · 코드 PR
- 구글 플레이 `daily_request_cap` — 45 [확인 불가 — PR #549 기록상 DB 적용 완료, SQL-A 로 확인] · 무인(2배 이내 올리기만, `lib/review/request-cap.ts`) · 롤백 SQL 은 #549
- 소스별 `daily_request_cap` — [확인 불가, SQL-A] · 무인은 현재값 2배 이내 올리기만, 내리기는 사람 · `review_source_cap_log` 로 되돌림
- 소스별 `cap_base` — [확인 불가, SQL-A] · 첫 입력 = CC(사전 승인, 깨끗한 새 소스만 무승인 50%) · 올리기 = 남헌 · 무인은 차단선 재정의로 내리기만 · 원래 값 25% 하한(`CAP_FLOOR_RATIO`) 안 자동 복구
- 퍼센트 램프 `pct_step` 50→90 — [확인 불가, SQL-A] · 무인(연속 정상 `PCT_RISE_OK_DAYS` 2일마다 한 단계, 차단 시 직전 단계·`RAMP_FREEZE_DAYS` 3일 동결, 차단 이력 `PCT_ESCALATED_FREEZE_DAYS` 14일) · `review_source_ramp_log`
- `daily_request_target` — floor(min(cap_base, 몫) × pct_step / 100) [확인 불가] · 무인
- `targets_per_run`(tpr)·`schedule_plan` — [확인 불가, SQL-A] · 무인(램프) · 회당 6회 상한 `MAX_RUNS_PER_DAY` 6, 회당 90분 `RUN_TIME_SEC`
- `CAP_FALLBACK_PCT` — 50(cap_base 없을 때 B) · 코드
- `GENERATOR_DAILY_CAP` 후보 생성기 하루 몫 — 45(dry-run 보고 수, 등록 아님) · CC
- `AREA_FIT_MIN` 언급 루프 영역 적합 — 0.9 · `MIN_POSTS_DEFAULT` 3 · CC
- 언급 루프 iTunes lookup — 하루 ≤30, 옵트인(`--lookup`), 기본 꺼짐 · 사람 판단(robots 취지)
- iTunes /search `SEARCH_DAILY_CAP` — 100/일(KST, 로그 합), 간격 3초, 차단 1건 즉시 중단(`scripts/anchor-verify.mjs`, #568) · 롤백 = 0 또는 `ITUNES_SEARCH_DISABLED=1`
- `ANCHOR_MIN_RATINGS` — 50(앵커 판정 평가 수 하한) · CC
- 같은 개발사 앱 `LOOKUP_MAX_REQUESTS` 40 · `LOOKUP_INTERVAL_MS` 4000 · `MIN_RATINGS` 20 · CC
- 앱스토어 RSS `MAX_PAGE` — 10페이지(최대 500건) · 어댑터 상수
- 러너 `MAX_PAGES_PER_TARGET` 20 · `STALE_STREAK_TO_STOP` 5 · `RECHECK_SEEN_STREAK` 5 · 코드
- 연속 0건 닫기 `MAX_CONSECUTIVE_EMPTY` 3 · 게시판 `BOARD_MAX_CONSECUTIVE_EMPTY` 30 · 코드(health.ts 와 한 벌)
- `GP_REPEAT_BELOW` 100(구글 플레이 재방문 우선 훅, 기본 꺼짐) · 남헌 승인 뒤 한 줄
- 발굴 `DISCOVERY_TARGET`(HN 후보 수) — 리포 변수 4 · CC · `DISCOVERY_MIN_VOC_HITS` 200 / `DISCOVERY_MAX_VOC_HITS` 50,000(코드 기본, 변수 없음)

### 1-2. 되살리기(재방문 시계)
- `TARGET_CLOCK_INCREMENTAL` — on [실측 변수] · CC · 롤백 = 변수 삭제(관찰 모드)
- `TARGET_CLOCK_INCREMENTAL_MAX` — 20 [실측 변수] · 천장 `TARGET_REVIVE_TOTAL_CEILING` · 기본 5 · CC
- `TARGET_REVIVE_TOTAL_CEILING` — 미설정 → 40(`REVIVE_TOTAL_PER_RUN`) · 하드 천장 200(`REVIVE_HARD_CEILING`) · CC · 롤백 = 변수 삭제
- `TARGET_REVIVE_PER_SOURCE` — 미설정 → 6(`REVIVE_PER_RUN`) · 하드 천장 200 · CC
- `TARGET_REVISIT_SCALE` — 미설정(배율 1) · [0.25, 1] 줄이기만, 하한 1일 · CC
- `REVISIT_MIN_DAYS` 3 / `REVISIT_MAX_DAYS` 14 — 헌법 §10.1 "3~14일" · 남헌
- `REVISIT_EXPECTED_NEW` K=3 · `REVIVE_MIN_EXPECTED_NEW` 1(expected_low) · 코드
- 지수 항 2^consecutive_empty — 숨은 천장 (가). **새 변수 `TARGET_REVIVE_CE_EXP_MAX`**(이 PR, 미설정 = 현행, 정수 0~10, 소스별 JSON) · CC · 롤백 = 변수 삭제
- queue_full(tpr − active) — 숨은 천장 (나). **새 변수 `TARGET_REVIVE_QUEUE_SLACK`**(이 PR, 미설정 = 0, 정수 0~200, 소스별 JSON) · CC · 롤백 = 변수 삭제
- `GAUGE_WARN_DAYS` 14 / `GAUGE_URGENT_DAYS` 7 — 연료계 표시 · 코드

### 1-3. 판정·추출·LLM
- `RELEVANCE_SECOND_MAX` — 4000 [실측 변수] · 기본 200 · 천장 없음 · CC · 롤백 = 변수 삭제
- `RELEVANCE_SECOND_DEADLINE_MIN` — 40 [실측 변수] · 기본 20 · 실효 천장 = 스텝 `timeout-minutes: 55` · CC
- `BATCH`(2차 묶음) — 20 · 코드
- `LLM_DAILY_BUDGET_USD` — 미설정 → 워크플로 기본 '5' · **프로세스 단위**다(§6-3) · 돈 드는 결정 = 남헌
- `LLM_REQUEST_BUDGET_USD` 0.5 · `LLM_USD_PER_MTOK_IN/OUT` 0.5/4(추정 단가) · 코드 기본
- `TRANSLATE_DAILY_BUDGET_USD` 미설정 → 3 · `TRANSLATE_DEADLINE_MIN` 25(워크플로 고정)
- Gemini 모델 회전 — 3.6-flash → 3.5-flash → 3-flash-preview → 3.5-flash-lite → 3.1-flash-lite, 4바퀴, 429/404 모델은 그 실행에서 제외(`lib/analysis/llm.ts`) · `GEMINI_MODEL` 로 덮어쓰기
- `RELEVANCE_MAX_PROJECTS` 30 · `RELEVANCE_DEADLINE_MIN` 80 · `RELEVANCE_SAMPLE` 1000 · `RELEVANCE_CHAIN_MAX_HOPS` 24(완화 60) · 전부 변수 미설정 = 기본 · CC
- 세션 캡 `config/session-guard.json` — 소프트 15% / 하드 30%, T2 전용 20% / 35%(~2026-10-26 KST), 5시간 창 50%, 주간 정지 off · 남헌(파일 PR)
- `EXTRACT_AUTO_DAILY_MAX` — 48 [실측 변수] · 자동 조정 범위 24~72(`AUTOTUNE`), 슬롯 천장 24 · `EXTRACT_AUTOTUNE` on · `EXTRACT_AUTO_MAX_PROJECTS` 16 · `EXTRACT_AUTO_MIN_NEW` 미설정 → 100
- T2 자동 승인 킬스위치 `KILL` — p0 7%, 창 50, 최소 감사 10, 최근 14일 20건 · 헌법 §10.1 예외 · 남헌
- 케이스 자동 승인 `CA_MIN_LINKED` 3 · `CA_AUDIT_DAILY` 2 · `CASE_AUTO_APPROVAL_STAGE` 미설정 = off · 남헌

## 2. 병목 표 첫 판 — 지금 일을 막는 한도

- [실측] `DISCOVERY_TARGET_MAX`=5(10-16 까지) → 창문 등재가 매일 5건에서 끊겼다. 채택은 14·25·43·19·30건(10-12~16, window-probe.json), 잘림(`daily_cap` pending)은 9·20·38·17·27건, 대기 누적은 106건이다.
  변수 200·#551 머지로 풀렸다. 첫 확인은 10-16 22:23Z 슬롯 실행의 "등재 N" 이다 [확인 불가 — 아직 안 돎].
  풀린 뒤에는 앱스토어 30% 게이트 여유(`gateHeadroom`)가 등재 상한이 된다. 대기 106 + 하루 채택 20~40 이 그 여유를 넘는지는 SQL-C 로 본다.
- [실측] `WINDOW_MAX_REQUESTS`=80 → 10-14·15·16 세 번 모두 `appstore=quota`(요청 80/80)였다. 120 은 10-16 15:56Z 에 설정했다. 그 뒤 첫 실행(10-16 22:23Z 슬롯) 결과는 아직 없다 [확인 불가].
- [실측] `GOOGLEPLAY_FROZEN_ACTIVE`=80 → 활성 85 라 구글 플레이 창문은 매일 0이다. 85 > 80 은 PR #464 의 17개 예외에서 생겼다.
- [실측] `RELEVANCE_SECOND_DEADLINE_MIN`=40 → 10-14 22:23Z 실행은 171/200, 10-15 11:45Z 는 144/200, 10-16 11:52Z 는 94/200 에서 마감으로 멈췄다. 10-15 21:56Z 실행만 200/200(4000)을 다 했다.
- [실측] 지수 항 2^ce → 증분형 되살림 후보 179건이 0건이 됐다. 사유는 `revisit_not_due` 130, `expected_low` 47, `queue_full` 2 다(10-16 nightly-review-collect 로그).
- [실측] queue_full → 같은 로그에서 clien 2건뿐이다. 지금은 작은 천장이다. 증분형 활성이 tpr 근처로 내려가면 커진다.
- [실측] `TARGET_CLOCK_INCREMENTAL_MAX`=20 → 실제 되살림 0이라 이 상한은 막고 있지 않다(앞 단계가 다 거른다).
- [실측] 앱스토어 30% 게이트 → 앱스토어 활성 0(연료계 `appstore 0일`)이라 막지 않는다. 앱스토어를 막는 것은 재방문 시계다. exhausted 155개 전부 `revisit_not_due`, 다음 자격은 10-17 01:54Z 다.
- [확인 불가] 소스별 `daily_request_cap`·`cap_base`·tpr — SQL-A 로 본다. 요청 예산이 막는 소스가 있는지는 SQL-D(실행별 requests vs 목표)로 판정한다.

## 3. 숨은 천장 둘 — 코드 PR(기본 = 현행, 변수로만 풀림)

- (가) `TARGET_REVIVE_CE_EXP_MAX` — JSON `{"<source_key>"|"*": k}`. revisitDays 의 2^consecutive_empty 에서 지수를 min(ce, k)로 자른다.
  결과는 여전히 clamp(3, 14) 안이라 헌법 §10.1 "재방문 간격 3~14일" 문구 안이다. 소스 키가 우선이고, 없으면 "*" 를 쓴다.
- (가) 효과 예: λ=1건/일·ce=3 이면 지금은 3×8=24 → 14일이다. k=2 면 12일, k=0 이면 3일이다.
  게시판은 30회 연속 0건으로 닫혀 지수가 30이다. 그래서 k 없이는 λ 와 무관하게 항상 14일이 된다.
- (나) `TARGET_REVIVE_QUEUE_SLACK` — JSON 같은 꼴. queue_full 문턱 `n ≥ tpr − active` 에 k 자리를 더한다.
  소스별 실행당(6)·전체(40)·증분형 상한(`TARGET_CLOCK_INCREMENTAL_MAX`)·`expected_low` 는 그대로 묶는다(셀프테스트로 고정).
- 범위 밖·정수 아님은 그 항목만 버린다. 실행 로그와 job summary 에 "⚠️ 되살리기 상한 경고" 한 줄을 남긴다(§7.2).
- 롤백 = 리포 변수 삭제(즉시) 또는 PR revert. DB 쓰기 경로는 바뀌지 않았다(status·consecutive_empty, exhausted→active 만).
- 켜는 순서 제안(CC 자율): 먼저 `TARGET_REVIVE_CE_EXP_MAX={"*":2}` 를 하루 둔다. 다음 날 로그의 `revisit_not_due`·`expected_low`·실제 되살림 수를 본다.
  게시판만 풀려면 `{"clien":2,...}` 처럼 소스를 적는다. 앱스토어·유튜브(비증분형)는 ce 가 보통 0~2라 영향이 작다.

## 4. 앱스토어 칸 회전(D-47-2) — 설계만, 코드 PR 없음

- 전제 점검 [실측]: 30% 게이트는 `status='active'` 만 센다(`gateHeadroom`). 앱스토어는 비증분형이라 한 번 방문하면 러너가 바로 exhausted 로 닫는다.
  그래서 0건 타깃은 칸을 오래 붙잡지 않는다. 10-16 로그에서 앱스토어 활성은 0, exhausted 는 155다.
- 0건 타깃 64개(41%, explosive-collection-plan 실측)가 실제로 먹는 것은 이렇다.
  재방문 시계가 λ=0 → 14일마다 다시 연다. 같은 실행에서 tpr 슬롯 하나와 RSS 요청 몇 개를 쓰고 다시 닫힌다. 하루 약 4.6슬롯이다 [추정, plan f-2].
- 그래서 규칙은 "exhausted 로 빨리 돌리기"가 아니라 "0건 타깃을 다시 열지 않거나 늦게 열기"가 맞다. 후보 조건은 셋이다.
  - Z1: `source_key='appstore' ∧ total_collected=0 ∧ last_run_at > created_at`(방문 1회 이상)
  - Z2: `consecutive_empty ≥ 2`(빈 방문 2회 연속 — 러너가 비증분형도 0건 방문마다 +1)
  - Z3: `created_at ≤ now − 14일`(시계 한 바퀴 이상)
- 동작 A(제안): Z1∧Z2∧Z3 이면 planRevive 가 `zero_yield` 로 건너뛴다. DB 쓰기가 없고 롤백은 코드 revert 다.
- 동작 B(제안): 간격을 30일로 늘린다(plan f-2). 이건 "3~14일" 문구 밖이다.
- 헌법 관계: 창문 강등(§10.1)은 `window-adopted.json` id 만, 등재 3일 뒤 신규 0이면 active→exhausted 다.
  그런데 앱스토어 창문은 첫 방문 직후 이미 exhausted 라 강등이 구조적으로 못 돈다(10-16 실행: 5/5 "이미 exhausted").
  동작 A·B 는 강등이 아니라 재방문 시계의 축소다.
- 충돌 판정: 남헌 v48 §2-A 가 "조용해도 14일에 한 번은 첫 페이지를 본다"를 정했다(`REVISIT_MAX_DAYS` 주석).
  A 는 그 지시를 축소하고 B 는 문구 밖이다 → §10.2 예외 6(명시 지시 축소)이라 **PR 을 만들지 않았다**.
- 문구 제안 — 전: "재방문 간격 3~14일·소스별 실행당 상한은 `lib/review/target-supply.ts` revisitDays·planRevive"
- 문구 제안 — 후: "재방문 간격 3~14일(단, 앱스토어 `total_collected=0` ∧ 빈 방문 2회 연속 ∧ 등록 14일 경과 타깃은 다시 열지 않는다 — 사유 `zero_yield`, 해제 = 리포 변수 삭제)·소스별 실행당 상한은 …"
- 창문 강등 문구 제안 — 전: "등재 3일 뒤 신규 0(total_collected 증가 0)이면 `status`·`consecutive_empty` 두 칸만(active→exhausted, …)"
- 창문 강등 문구 제안 — 후: "…(active→exhausted). 비증분형(앱스토어)은 첫 방문에 이미 exhausted 이므로 강등 대신 위 `zero_yield` 규칙이 같은 역할을 한다"
- 회전 주기 측정: SQL-E 로 하루 앱스토어 방문 수·신규·0건 타깃 방문 비중을 14일치 본다.
  회전 주기 = 앱스토어 타깃 수 ÷ 하루 방문 수(일)이고, 0건 낭비율 = 0건 타깃 방문 ÷ 전체 방문이다. 규칙 적용 전 7일과 적용 후 7일을 비교한다.

## 5. 하루 채택 vs 등재 7일 표(D-47) — 파일 대장 쪽은 이미 계산함

- 10-12: 프로브 63 · 채택 14 · 등재 5 · 잘림 9(daily_cap)
- 10-13: 프로브 62 · 채택 25 · 등재 5 · 잘림 20(daily_cap)
- 10-14: 프로브 67 · 채택 43 · 등재 5 · 잘림 38(daily_cap)
- 10-15: 프로브 64 · 채택 19 · 등재 5 · 잘림 17(daily_cap)
- 10-16: 프로브 69 · 채택 30 · 등재 5 · 잘림 27(daily_cap)
- 10-17·10-18: 아직 실행 전. 같은 계산은 아래 node 한 줄로 다시 낸다(파일만 읽는다).
- 근거 파일: `reports/<날짜>/window-probe.json`(verdict=adopted), `reports/window-adopted.json`(id 있는 행 = 등재, pending.reason = 잘림 사유)

```
node -e "const fs=require('fs');const k=t=>new Date(Date.parse(t)+9*36e5).toISOString().slice(0,10);const D={};const g=d=>D[d]??={probed:0,adopted:0,registered:0,cut:{}};for(const d of fs.readdirSync('reports')){const f='reports/'+d+'/window-probe.json';if(!fs.existsSync(f))continue;for(const w of JSON.parse(fs.readFileSync(f)).windows??[]){const x=g(k(w.probed_at));x.probed++;if(w.verdict==='adopted')x.adopted++}}for(const e of JSON.parse(fs.readFileSync('reports/window-adopted.json')).entries){if(e.id)g(k(e.registered_at)).registered++;else if(e.pending_since){const x=g(k(e.pending_since));x.cut[e.reason]=(x.cut[e.reason]||0)+1}}console.log(Object.entries(D).sort().slice(-7).map(([d,x])=>d+' 프로브 '+x.probed+' 채택 '+x.adopted+' 등재 '+x.registered+' 잘림 '+JSON.stringify(x.cut)).join('\n'))"
```

### SQL-B — 등재분의 DB 쪽(현재 상태·방문·수확), CEO-staff 실행

```sql
-- 읽기 전용. 대장(window-adopted.json) id 25개, 2026-10-17 기준. 새 등재가 생기면 위 node 로 VALUES 를 다시 뽑는다.
WITH ledger(id, reg_day) AS (VALUES
  ('9c31447c-2816-43af-ab63-d8b31ae85f2f'::uuid, DATE '2026-10-12'),
  ('24cfbc32-4089-4bac-9442-794218997859'::uuid, DATE '2026-10-12'),
  ('69d93823-353f-4e21-87c9-f3a210a40d00'::uuid, DATE '2026-10-12'),
  ('7e087afc-3e16-437b-a9b1-7cc6de953133'::uuid, DATE '2026-10-12'),
  ('ac24f54c-699a-4d59-b11f-f3189548e145'::uuid, DATE '2026-10-12'),
  ('e63413dd-d818-4596-8d75-d3bdca14a35b'::uuid, DATE '2026-10-13'),
  ('2b49c14a-a7dc-4d4f-ac69-3a59d06b6832'::uuid, DATE '2026-10-13'),
  ('bd2cf657-e888-4afb-bb93-f72650e581f0'::uuid, DATE '2026-10-13'),
  ('0ebc58de-f4f7-4ab8-bee9-15c75f2722b6'::uuid, DATE '2026-10-13'),
  ('0c5f87cd-d2c0-4257-a79c-a9649eae3ae2'::uuid, DATE '2026-10-13'),
  ('7cb105d5-ecca-4017-b5a8-e4a977bff86c'::uuid, DATE '2026-10-14'),
  ('7eda1056-9037-4483-b204-d6103823d8a1'::uuid, DATE '2026-10-14'),
  ('27f71556-e9f4-495c-85a2-6778dc029a13'::uuid, DATE '2026-10-14'),
  ('65808a90-4d67-424f-b036-7d6e46635990'::uuid, DATE '2026-10-14'),
  ('8bcdfe7f-70ce-4320-ab5c-9e74d8c2d96f'::uuid, DATE '2026-10-14'),
  ('68f9ec02-97e8-4c3b-a13d-3fca9d37d564'::uuid, DATE '2026-10-15'),
  ('0223f197-f6e2-4ea5-97db-7353e9e9b9d3'::uuid, DATE '2026-10-15'),
  ('9b3297a4-d189-4342-afc0-31209bbc025f'::uuid, DATE '2026-10-15'),
  ('67a00682-8236-4042-8ff8-78522029f2c2'::uuid, DATE '2026-10-15'),
  ('eaeff3fc-3aa5-496b-9dc8-b9ee511fa0c1'::uuid, DATE '2026-10-15'),
  ('937d1a7a-d92f-4bf7-ac65-d1a715a1fb7c'::uuid, DATE '2026-10-16'),
  ('7f7ec1c8-3d68-48e3-9ffd-9bfe34a3d7d2'::uuid, DATE '2026-10-16'),
  ('71acb496-7455-4efb-b352-d25df305e7a3'::uuid, DATE '2026-10-16'),
  ('741e789e-3efc-4336-a78b-8be477eb7eb9'::uuid, DATE '2026-10-16'),
  ('cd6104b4-3b94-49f3-99f3-11c908fdd72c'::uuid, DATE '2026-10-16'))
SELECT l.reg_day,
       count(*)                                                        AS registered,
       count(t.id)                                                     AS found_in_db,
       count(*) FILTER (WHERE t.status = 'active')                      AS active_now,
       count(*) FILTER (WHERE t.status = 'exhausted')                   AS exhausted_now,
       count(*) FILTER (WHERE t.last_run_at > t.created_at)             AS visited,
       count(*) FILTER (WHERE t.last_run_at > t.created_at AND COALESCE(t.total_collected, 0) = 0) AS zero_after_visit,
       COALESCE(sum(t.total_collected), 0)                              AS harvest
  FROM ledger l LEFT JOIN public.review_targets t ON t.id = l.id
 GROUP BY l.reg_day ORDER BY l.reg_day;

-- 대조: 대장과 무관하게 DB 에 하루 몇 개가 들어왔나(창문 외 경로 포함), 최근 7일
SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day, source_key, count(*) AS created
  FROM public.review_targets
 WHERE created_at >= now() - interval '7 days' AND source_key IN ('appstore', 'googleplay')
 GROUP BY 1, 2 ORDER BY 1, 2;
```

## 6. RELEVANCE_SECOND_MAX 4000→8000 — 실효 없음, 바꾸려면 셋을 같이

- 처리량 [실측, 실행 로그]: 묶음 20건, 분당 54~100건이다(10-16 94묶음/35분, 10-15 144/36분, 10-14 171/34분).
- 마감 [실측 코드]: `DEADLINE_MS` 는 스크립트 시작부터 잰다. 후보 선정(4~5분, 46k행 페이지 읽기)이 40분 안에 들어가 판정 시간은 약 35분이다.
- 그래서 실행당 1,900~3,500건이 한계다. 4000 은 4회 중 1회만 닿았고 8000 은 0회 닿는다.
- 예산 [실측 코드]: `LLM_DAILY_BUDGET_USD` 누적은 `lib/analysis/budget.ts` 모듈 변수라 **프로세스마다 0에서 시작한다**.
  $5 ÷ $0.00093/건 ≈ 5,376건이 실행당 천장이다. 8000×$0.00093 = $7.44 라 예산이 먼저 멈춘다(`blocker`).
  이름은 "하루"지만 실제로는 실행당이라, 2차가 하루 최대 3회 돌면 명목 $15 까지 쓸 수 있다(§7-4).
- Gemini 일일 요청 한도 [확인 불가]: 8000건은 400호출이다. 무료 티어는 모델별 일일 한도가 있다(3.6-flash 20건/일, 코드 주석).
  로그상 대부분을 3.5-flash-lite 가 받았다. 그 모델의 한도는 리포에 기록이 없다.
- 대기량 [실측 로그]: 2차 대상은 52,630(10-14) → 50,391(10-15) → 11,620(10-16)이다. 10-16 실행 뒤 남은 것은 7,620건이다.
  지금 속도(하루 최대 3회 × 2~4천)로 1~2일에 비워진다. 8000 이 필요한 상황이 아니다.
- 8000 을 실효로 만들려면 셋을 같이 바꿔야 한다.
  - `RELEVANCE_SECOND_DEADLINE_MIN` ≥ 150(분당 54건 최악 기준). 스텝 `timeout-minutes: 55`·잡 `timeout-minutes: 150`(1차 마감 80분 포함)을 함께 늘리거나 2차를 별 잡으로 뺀다 — 워크플로 PR.
  - `LLM_DAILY_BUDGET_USD` ≥ 8.2(여유 10%). 돈 드는 결정이라 §10.2 예외 7 → 남헌이다. 단, 2차 키가 무료 티어면 실제 청구는 0이다 [확인 불가 — 키 플랜].
  - 그다음에 `RELEVANCE_SECOND_MAX` 8000.
- 권고: 4000 은 그대로 둔다. 처리량을 올리고 싶으면 워크플로 변경 없이 `RELEVANCE_SECOND_DEADLINE_MIN=50` 으로 올린다(스텝 55분 안). 묶음 수가 약 +25%다.
  마감 시계를 후보 선정 뒤부터 재는 것도 같은 효과다(코드 한 줄, 다음 PR 후보).

## 7. 헌법과의 충돌·어긋남 목록 — 수정하지 않았다, 전/후 문장만

- 7-1 §10.1 창문 자동 등재 "DISCOVERY_TARGET_MAX (환경변수; … 현재 200; 되돌리기 = 변수를 5로)" — 10-16 18:47Z 부터 실물과 맞다(#551 머지 · 변수 200).
  어긋남은 없다. 다만 "현재 200" 은 시점 값이라, 변수가 바뀌면 문구가 낡는다. 후(제안): "현재 값은 `gh variable list` 가 정본(미설정 12)".
- 7-2 §10.1 창문 강등 — 앱스토어는 첫 방문에 exhausted 가 돼 강등이 한 번도 안 돈다(§4). 전/후 문장은 §4.
- 7-3 §10.1 재방문 시계 "3~14일" — 이 PR 의 (가)는 clamp 안이라 충돌이 없다. plan f-2 의 30일·`zero_yield` 는 충돌한다(§4).
- 7-4 `LLM_DAILY_BUDGET_USD` — 문서·변수 이름은 "하루"인데 코드는 프로세스 단위다. 헌법 문구는 아니지만 돈 관련이라 적는다.
  전(budget.ts 주석): "하루 상한(LLM_DAILY_BUDGET_USD, 기본 $5)". 후(제안): "실행(프로세스)당 상한 — 하루 합은 실행 수 × 이 값까지 갈 수 있다".
- 7-5 D-48 자동 하향을 워크플로가 `gh variable set` 으로 하려면 변수 쓰기 권한이 필요하다(§8). §10.2 "permissions 확대 = 사람"이다.

## 8. 품질 자동 방어선(D-48 D) — 설계·가능 여부만, PR 없음

- 표본 SQL-F: 최근 7일 등재 타깃의 승인 리뷰(자동 승인 또는 사람 relevant) ∧ 1차 relevant ∧ `product_informative` 에서 하루 20건을 고정 난수로 뽑는다.
  리뷰↔타깃 연결은 `review_fingerprints(source_key, product_ref, analysis_input_id)` 로 한다 — 정확한 연결이다.
- 판정 기록: `reports/<KST>/quality-sample.jsonl`, 한 줄 = `{"date","input_id","target_id","label","area_ok":true|false|null,"informative_ok":true|false|null,"judge":"남헌|claude-cli","note"}`
- 정확도 = (area_ok ∧ informative_ok) ÷ (둘 다 판정된 행)이다. 판정된 행이 20 미만이면 "확인 불가"이고, 이때는 내리지 않는다(올리지도 않는다).
- 절차: 정확도 < 80% 면 다음 실행 전에 `DISCOVERY_TARGET_MAX` 를 한 단계 내린다(200→150→100→50, 하한 50). 내린 기록을 같은 jsonl 끝에 `{"step":"150","from":"200","acc":0.75,"n":20}` 로 남긴다.
  올리기는 남헌만 한다. 같은 날 두 단계는 내리지 않는다.
- 자동화 가능 여부:
  - 워크플로의 `GITHUB_TOKEN` 은 리포 변수를 쓸 수 없다(`permissions` 에 variables 항목이 없다).
  - 기존 봇 앱(`BOT_APP_*`) 토큰은 앱에 "Variables: write" 권한이 있어야 하는데 [확인 불가], 없으면 앱 권한 확대다.
  - 둘 다 §10.2 예외 3·워크플로 "권한 확대 = 사람"에 걸려 PR 을 만들지 않았다.
- 대안(권한 확대 없음, 제안): 하향 상태를 `reports/quality-gate.json`(`{"discovery_target_max_cap":150,"since":...}`)에 봇이 커밋한다. window-discovery 는 min(리포 변수, 이 파일 값)을 쓴다.
  내리기만 파일이 하고 올리기는 사람이 파일을 지운다. 기존 push-reports 경로(reports/ 프리픽스)만 쓰므로 새 시크릿·권한이 없다.
  #551 은 머지됐으므로 다음 PR 하나로 된다(window-discovery 가 파일 값을 읽는 몇 줄 + 셀프테스트).
- 판정 주체: 첫 14일은 남헌 채점을 권한다. 1차 판정과 같은 계열(claude-cli)이 표본을 채점하면 독립성이 없다.

## 9. 등재 순서(D-48 E) — 코드 PR

- 대상: 언급 루프 `planGate`(`lib/discovery/mention-loop.ts`). ready 는 이미 영역 적합 ≥0.9 ∧ anchored 통과분이다.
  그 안에서 정렬을 바꿨다 — 앱 평가 수(iTunes `userRatingCount`, 리뷰 수 대리값)가 많은 순, 그다음 기존 점수, 그다음 키 순이다.
- 앱스토어 30%·구글 플레이 80 게이트와 남은 자리 계산은 그대로다. 자리가 모자랄 때 큰 앱이 먼저 들어간다.
- 언급 루프는 아직 dry-run(파일만, DB 쓰기 0)이라 운영 영향이 없다. 롤백 = PR revert.
- 창문 등재(`window-discovery planRegistration`, 요청당 새 글 순 — 첫 페이지 50 에서 동점이 많다)는 손대지 않았다.
  같은 줄을 PR #554 가 바꾸고 있어 충돌을 피했다. 동점 정렬에 앵커 `total_collected` 를 넣는 것은 #554 머지 뒤 한 줄이다.

## 10. CEO-staff 가 돌릴 읽기 SQL

### SQL-A — 소스별 상한(DB 값 대장)

```sql
SELECT s.key, s.enabled, s.override, s.daily_request_cap,
       r.cap_base, r.pct_step, r.daily_request_target, r.targets_per_run, r.frozen_until,
       r.consecutive_ok_days, r.supply_state, r.schedule_plan
  FROM public.review_sources s
  LEFT JOIN public.review_source_ramp r ON r.source_key = s.key
 ORDER BY s.enabled DESC, s.key;
```

### SQL-C — 소스별 타깃 상태(30% 게이트 분자·분모, 0건·미방문)

```sql
SELECT t.source_key, t.status, count(*) AS n,
       count(*) FILTER (WHERE COALESCE(t.total_collected, 0) = 0) AS zero_collected,
       count(*) FILTER (WHERE t.last_run_at IS NULL)               AS never_visited
  FROM public.review_targets t
  JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
 GROUP BY 1, 2 ORDER BY 1, 2;
```

### SQL-D — 요청 예산이 막는가(최근 7일 실행별 요청 vs 목표)

```sql
SELECT r.source_key, (r.started_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day,
       sum(r.requests) AS requests, sum(r.targets_visited) AS visits, sum(r.new_reviews) AS new_reviews,
       sum(r.blocked_responses) AS blocked, max(m.daily_request_target) AS target, max(s.daily_request_cap) AS cap
  FROM public.review_collection_runs r
  JOIN public.review_sources s ON s.key = r.source_key
  LEFT JOIN public.review_source_ramp m ON m.source_key = r.source_key
 WHERE NOT r.dry_run AND r.started_at >= now() - interval '7 days'
 GROUP BY 1, 2 ORDER BY 1, 2;
-- requests 가 min(target, cap) 의 90% 이상인 날이 이어지면 그 소스는 요청 예산이 막는다.
```

### SQL-E — 앱스토어 회전 후보(Z1∧Z2∧Z3)와 회전 주기

```sql
-- 후보(읽기 전용, 쓰기 없음). any_fp = 이 ref 로 지문이 하나라도 있나(0건 원인: 리뷰 없음 vs RSS 404·국가 미판매 가르기)
SELECT t.id, t.product_ref, t.label, t.status, t.consecutive_empty, t.total_collected, t.created_at, t.last_run_at,
       EXISTS (SELECT 1 FROM public.review_fingerprints f WHERE f.source_key = 'appstore' AND f.product_ref = t.product_ref) AS any_fp
  FROM public.review_targets t
 WHERE t.source_key = 'appstore' AND COALESCE(t.total_collected, 0) = 0
   AND t.last_run_at > t.created_at AND t.consecutive_empty >= 2
   AND t.created_at <= now() - interval '14 days'
 ORDER BY t.status, t.created_at;

-- 회전 주기·낭비율(최근 14일). last_run_at 은 마지막 방문만 남아 zero_last_visits 는 하한이다.
SELECT (started_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day, sum(targets_visited) AS visits, sum(new_reviews) AS new_reviews, sum(requests) AS requests
  FROM public.review_collection_runs
 WHERE source_key = 'appstore' AND NOT dry_run AND started_at >= now() - interval '14 days'
 GROUP BY 1 ORDER BY 1;
SELECT (last_run_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day,
       count(*) FILTER (WHERE COALESCE(total_collected, 0) = 0) AS zero_last_visits, count(*) AS all_last_visits
  FROM public.review_targets
 WHERE source_key = 'appstore' AND last_run_at >= now() - interval '14 days'
 GROUP BY 1 ORDER BY 1;
```

### SQL-F — 품질 표본 20건(D-48 D)

```sql
-- 같은 날 같은 결과(고정 난수 md5(id || KST 날짜)). 영역 = 프로젝트 area_code vs 타깃 라벨 접두(N:).
WITH recent AS (
  SELECT id, source_key, product_ref, label, created_at
    FROM public.review_targets
   WHERE created_at >= now() - interval '7 days'
), pool AS (
  SELECT DISTINCT ON (v.input_id)
         v.input_id, r.id AS target_id, r.source_key, r.product_ref, r.label, p.area_code,
         v.verdict, v.second_verdict, v.product_informative, v.auto_approval_rule, v.human_verdict,
         left(i.raw_text, 400) AS text_head
    FROM recent r
    JOIN public.review_fingerprints f
      ON f.source_key = r.source_key AND f.product_ref = r.product_ref AND f.analysis_input_id IS NOT NULL
    JOIN public.review_relevance_verdicts v ON v.input_id = f.analysis_input_id
    JOIN public.analysis_inputs i ON i.id = v.input_id AND i.purged_at IS NULL
    JOIN public.analysis_projects p ON p.id = v.project_id
   WHERE (v.auto_approved_at IS NOT NULL OR v.human_verdict = 'relevant')
     AND v.verdict = 'relevant' AND v.product_informative IS TRUE
)
SELECT * FROM pool
 ORDER BY md5(input_id::text || to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'))
 LIMIT 20;
```

## 11. 사람 판단 필요

- 앱스토어 0건 타깃을 다시 열지 않기(`zero_yield`) 또는 30일 간격 — 남헌 v48 "14일 보장" 축소, §10.2 예외 6
- `LLM_DAILY_BUDGET_USD` 상향(8000 을 실효로 만들 때만) — §10.2 예외 7. 2차 Gemini 키가 유료인지 먼저 확인한다
- D-48 자동 하향을 리포 변수로 할 경우의 권한(봇 앱 Variables 쓰기) — §10.2 예외 3. 대안(reports 상태 파일)은 사람 판단이 필요 없다
- §10.1 `DISCOVERY_TARGET_MAX` 문구 — 지금은 맞다. "현재 200" 을 "변수가 정본"으로 바꿀지는 남헌 몫(선택)
- 구글 플레이 활성 85 > 동결선 80 — 1:1 맞바꾸기를 할지, 동결선을 올릴지
