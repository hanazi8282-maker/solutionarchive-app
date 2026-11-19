# S-cron-fix — Nightly Review Collect 연속 실패 복구 (v71cu-3 §1-1)

작성 2026-11-19 · 서브에이전트(DB 접근 없음 — 아래 "오케스트레이터가 확인할 것" 참조)

## 증상

마지막 성공 2026-11-18 18:14Z(실행 44367498861). 그 뒤 세 번 연속 빨간불.

| 실행 | 시작(UTC) | 슬롯(cron) | 결과 | 걸린 곳 |
|---|---|---|---|---|
| 44401674264 | 11-18 21:27 | `19 13` | failure | github_issues 403 |
| 44421343490 | 11-18 23:30 | `37 17` | failure | youtube `원문 적재 실패: canceling statement due to statement timeout` |
| 44441217554 | 11-19 02:01 | `47 20` | cancelled | youtube 저장 70분 → 잡 timeout 90분 |

세 로그 모두 `gh run view <id> --log` 로 직접 읽었다(만료 전).

## 원인 3건

### ① github_issues 403 (21:27Z) — 확정, 재시도 폭주 아님

- 로그: `board:postiz — 차단 응답 403 — 실행을 중단한다`. 그 앞 6개 타깃은 정상(신규 20건). 403은 **1건**이었고, 러너는 그 자리에서 소스를 멈췄다.
- 다음 실행(23:30Z)의 램프 줄이 `동결 ~2026-12-02T21:37` 이고 요청 0건 — 차단 되돌리기(rollbackOnBlock)가 이미 속도를 낮추고 얼렸다. **재시도 폭주는 없다.**
- 잡이 빨개진 이유는 `review-collect.mjs` 의 "차단(403/429)은 실패로 센다" 규칙이다. 의도된 동작이다.
- 403 본문은 로그에 없어서 "무토큰 Search 한도 초과"(분당 10회, 러너 IP를 다른 사용자와 같이 씀)인지 진짜 차단인지 가를 수 없었다. 한도 초과로 **추정**한다. 앞서 6건이 7초 간격으로 나갔고, 공유 IP라 한도가 먼저 차 있었을 수 있다.
- **끄지 않기로 했다.** 사유: (a) 재시도 폭주가 아니다. 실행당 403은 최대 1건이고, 동결 중엔 요청 0건이다. (b) github 어댑터가 한도 초과 403도 차단으로 세는 것은 v71ad 지시다. 그걸 quota로 바꾸는 일은 남헌 지시와 충돌한다(§10.2 예외 6). (c) `review_sources.enabled` 를 끄는 무인 경로는 `owner_2026-10-14` 소스만 쓸 수 있다(§10.1). github_issues 는 해당하지 않는다.
- 수정은 진단용 한 줄만 넣었다. 차단 문구에 본문의 `rate limit` 표지가 있는지 남긴다(`· 본문에 'rate limit' 표지(한도 초과로 보임)`). 본문 자체는 찍지 않는다. GitHub 한도 메시지에 러너 IP가 들어 있고, 이 리포는 공개다.

### ② youtube 원문 적재 statement timeout (23:30Z) — 직접 원인은 추정, 구조 문제는 확정

- 로그: youtube 3요청에 저장 호출 647회, 354.8초 중 350.9초(99%)가 `리뷰저장`. 그러다 `analysis_inputs` **단건 INSERT** 가 57014로 죽었다.
- `analysis_inputs` 에는 INSERT 트리거가 없다(마이그레이션 전수 grep). 한 행 INSERT 가 8초를 넘으려면 잠금을 기다렸다고 보는 게 자연스럽다.
- **추정:** 같은 시각에 `20261119000013_analysis_inputs_indexes.sql` 이 적용됐다. 일반 `CREATE INDEX` 3개로, `CONCURRENTLY` 가 아니다. 이 문장은 테이블에 SHARE 잠금을 걸어 INSERT 를 막는다. PR #675 머지 시각은 2026-11-18 23:48:12Z이고, 파일 머리말에 "적용 완료"라고 적혀 있다. youtube 가 죽은 시각은 23:43:22Z다. 적용 시각은 DB 로그로만 확인할 수 있다(아래).
- 직접 원인과 별개로 구조 문제가 있다. 리뷰 1건마다 지문 INSERT·본문 중복 조회·원문 INSERT·지문 연결을 따로 왕복한다. 호출 하나가 0.25~0.6초다(11-18 실행 4개의 시간 분해 실측). 그래서 YouTube 채널 타깃(`ch:`, v71cu-2 1-4)처럼 한 페이지에 댓글 100건이 오는 소스는 저장만으로 수십 분을 쓴다.

### ③ cancelled (02:01Z) — 확정: concurrency 아님, timeout-minutes 90

- 시작 02:01:18Z, 취소 03:31:33Z, 정확히 90분이다. `##[error]The operation was canceled.` 는 잡 timeout 이다.
- **concurrency 충돌 아님:** 최근 30회 실행을 보면 시작·끝이 겹친 적이 한 번도 없다. `cancel-in-progress: false` 라 실행 중인 잡이 다른 실행에 밀려 취소되지 않는다.
- 로그: okky 가 02:16:50Z에 끝난 뒤 youtube 가 70분간 요청 43건에 저장 11,020회(4,169.7초, 99%)를 쓰다가 잘렸다. 뒤에 남은 소스 6개(disquiet·devto·n8n·make·bubble·glide)와 보고·폴백 스텝도 함께 날아갔다.
- 근본 원인은 시간 상한이 잡 하나에만 있다는 점이다. 러너 예산은 **요청 수**만 세고 저장 시간은 모른다. 계획 줄의 `P=min(시간 …)` 도 요청 간격만으로 계산한다.
- 덤: 스케줄 지연이 크다. `47 20` 슬롯은 5시간 14분 늦게 발화했고, `29 9` 는 약 9시간 늦었다. 기존에 알던 Actions 지연이며 이번 수정 범위 밖이다.

## 수정 (브랜치 `feat/v71cu-cron-fix`)

1. **원문 묶음 적재**: `lib/review/runner.ts` ingestPage · `lib/review/store.ts` appendInputs
   - 한 페이지의 신규 리뷰를 모았다가 `analysis_inputs` 에 **50행씩 한 INSERT** 로 넣는다(`INPUT_BATCH_SIZE`). 돌아온 id 를 입력 순서대로 지문에 연결한다. id 개수가 보낸 수와 다르면 예외를 던진다.
   - 57014가 나면 15초 기다렸다가 **한 번만** 다시 보낸다. 취소된 INSERT 는 롤백되므로 중복 적재는 없다. 두 번째도 실패하면 예전처럼 그 소스만 fatal 로 끝나고 다른 소스는 계속 돈다.
   - 같은 페이지에서 같은 긴 본문(≥120자)이 두 번 나오면 러너가 직접 `cross-target` 으로 센다. 예전엔 앞 글을 연결한 뒤 뒤 글을 store 가 조회해 걸렀는데, 묶어 넣으면 연결 전이라 못 거른다. 결과는 예전 실제 store 와 같다.
   - `appendInputs` 가 없는 store(셀프테스트 가짜)는 1건씩 넣는 방식으로 돌아간다.
2. **소스별·스크립트 전체 시간 몫**: `RunOptions.deadlineAt`, `collectWithRamp({deadlineAt})`, `scripts/review-collect.mjs`
   - 소스 하나 20분, 스크립트 전체 65분. 잡 90분 안에서 앞 스텝 약 5분과 뒤 스텝 여유 약 20분을 뺀 값이다.
   - 마감이 지나면 다음 페이지·다음 타깃을 요청하지 않는다. 커서는 그대로 두고 상태는 active 로 남긴다. 타깃별 줄에는 `실행 시간 몫 도달(N초) — 커서 유지, 다음 실행이 이어간다` 가 찍힌다(§7.2: 안전장치가 걸린 것이므로 정상으로 읽지 않는다). 첫 페이지 전에 마감되면 진행 저장을 하지 않으므로 consecutive_empty 도 올라가지 않는다.
3. **github 403 진단 한 줄**: 위 ①.
4. 워크플로 파일(`nightly-review-collect.yml`)은 **고치지 않았다.** concurrency 는 원인이 아니었고, timeout-minutes 90 은 스크립트 시간 몫이 먼저 걸리게 해서 남겨 두었다.
5. 마이그레이션은 쓰지 않았다(필요 없음).

## 검증

- `node scripts/review-runner-selftest.mjs` 618건 통과(추가분 13건): 신규 120건이 50·50·20 세 묶음으로 들어가는지, id 연결 순서, 같은 페이지 본문 중복, 마감 뒤 요청 0건과 커서 유지, 마감이 없으면 지금과 같이 도는지, 1건씩 폴백.
- `scripts/review-source-health-selftest.mjs`: 가짜 Supabase 가 배열 INSERT 에 배열을 돌려주게 고쳤다. 실제 PostgREST 와 같은 동작이다. 97건 통과.
- `scripts/review-indiehackers-selftest.mjs`: 기대값 60→59(+본문 중복 1), 59→58로 바꿨다. 픽스처 한 페이지에 같은 542자 댓글이 2개 있는 것을 직접 확인했다. 실제 store 는 예전에도 이걸 걸렀고, 가짜 store 가 그 조회를 하지 않아 60이 나왔던 것이다.
- 워크플로가 부르는 `review-*` 셀프테스트 43개 모두 통과. 실패로 찍힌 4개(`review-collect`·`hackernews-enrich`·`purge`·`request-cap`)는 DB 키가 필요한 본 스크립트라 로컬에서 실행 불가다.
- 57014 재시도 분기에는 셀프테스트가 없다(실제 15초 대기). 코드 리뷰로만 확인했다.

### 통과 기준 확인 방법(머지 후, 사람·역할 세션)

"nightly-review-collect 가 스스로 시작해 끝까지 성공"을 이렇게 확인한다.

1. 스케줄 슬롯 사이에 수동 1회 실행. 실적재여야 youtube 저장 경로를 탄다.
   `gh workflow run nightly-review-collect.yml -f dry_run=false -f source=all`
2. `gh run watch <id>` 후 `gh run view <id> --log` 에서 다음을 본다.
   - `### \`youtube\`` 블록에 `❌ 실행이 통째로 실패` 가 없다. 시간 분해의 `리뷰저장 N회` 가 예전 대비 줄었다. 신규 n건이면 원문 INSERT 가 n회가 아니라 ⌈n/50⌉회다.
   - 타깃별 줄에 `실행 시간 몫 도달` 이 있으면 안전장치가 걸린 것이다. 다음 슬롯에서 같은 타깃이 이어 읽는지 확인한다.
   - 잡 전체가 90분 전에 끝나고 뒤 스텝(Purge·Idea angle·Detect pending)이 돈다.
3. 그다음 **스케줄 실행 1회**가 초록이면 통과다. github_issues 는 12-02까지 동결돼 요청 0건이라, 그 사이에는 403으로 빨개지지 않는다.

## 오케스트레이터가 확인할 것 (DB — 이 세션은 접근하지 않음)

1. `20261119000013_analysis_inputs_indexes` 의 **실제 적용 시각**(Supabase 로그·`docs/migration-exceptions.md`·Notion 기록). 23:37~23:43Z와 겹치면 ②의 직접 원인이 확정된다. 앞으로 큰 테이블의 인덱스는 `CREATE INDEX CONCURRENTLY` 로, 수집 슬롯 밖에서 만드는 것을 권한다.
2. 23:30Z 실행에서 youtube 가 죽을 때 **지문만 있고 연결이 없는 행**: `review_fingerprints` 중 `source_key='youtube' AND analysis_input_id IS NULL AND first_seen_at >= '2026-11-18T23:37Z'`. 이 리뷰들은 다음 실행에서 'duplicate' 로 보여 다시 들어오지 않는다(예전부터 있던 구멍이다. 이번 수정으로 실패 1회당 최대 50건까지 넓어졌다). 건수만 세고, 지우는 일은 사람이 판단한다.
3. 02:01Z 실행이 잘리면서 `review_collection_runs` 에 youtube 행이 `running` 으로 남았는지 확인한다. 다음 실행이 `interrupted` 로 정리하므로 확인만 하면 된다.
4. youtube `ch:` 타깃 수와 하루 신규 건수. 시간 몫 20분으로 하루 몫을 소화할 수 있는지 본다. 못 하면 램프 목표가 아니라 시간 몫이 병목이 된다.

## 남은 불확실성

- ②의 직접 원인(인덱스 잠금)은 추정이다. 잠금이 아니었다면 50행 묶음도 같은 이유로 57014를 낼 수 있다. 재시도 1회로 버티고, 그래도 안 되면 그 소스 1개만 fatal 이 된다.
- github 403이 한도 초과인지 차단인지는 다음 403 때 새 표지 줄로 판정한다.
- 시간 몫 20분/65분은 실측에 맞춘 눈대중이다. 처음 며칠 동안 `실행 시간 몫 도달` 빈도를 보고 조정한다(`scripts/review-collect.mjs` 상수 2개).
- 원문 묶음 적재 실패 시 지문만 남는 구멍은 1건에서 최대 50건으로 넓어졌다. 근본적으로 막으려면 지문 기록을 적재 뒤로 옮기는 RPC 가 필요하다(마이그레이션 작업이다).
