## 수용기준 (AC)

**프리플라이트 (구현 착수 전, 실측으로만 답한다)**

- **AC-0-a** 서브에이전트가 다른 서브에이전트를 호출할 수 있는가를 1회 실측한다. 불가면 A안(부서장=슬래시 진입점), 가능이면 B안(부서장 에이전트 파일 추가). 결과를 `reports/status/` 에 근거와 함께 기록. "아마 안 될 것"으로 넘어가지 않는다.
- **AC-0-b** 헤드리스 `claude -p` 가 Write/Bash/WebSearch 를 **권한 프롬프트 없이** 쓸 수 있는 설정을 실측 확인한다(`--allowedTools` + 권한 모드). 기존 인사이트 루프는 `--max-turns 1`·도구 미사용이라 이 경로가 한 번도 검증된 적이 없다. **미확인 상태로 크론을 켜지 않는다.**
- **AC-0-c** `runClaude` 의 `cwd`/`env` 옵션 추가 후 `node scripts/insight-cli-selftest.mjs` 가 여전히 통과한다(기존 경로 무영향).
- **AC-0-d** `.claude/agents/implementer.md` 에서 Supabase MCP 도구가 제거되었거나 경고가 삽입되어 있다. `mcp__supabase__list_tables` 가 `transfer_orders` 를 반환한다는 사실이 문서에 근거로 남아 있다.

**드라이런 1회 (`workflow_dispatch`, dry_run=true)**

- **AC-1** 워크플로가 exit 0 으로 끝나고, `$GITHUB_STEP_SUMMARY` 에 S0~S9 **10개 스텝이 전부** 상태와 함께 나타난다(`pending` 잔여 0).
  (2026-09-08: PHASE C 에서 `queue_resolve` 스텝을 commit_cases 뒤에 추가해 9 → 10 이 됐다.)
- **AC-2** 실행 전후로 `SELECT count(*) FROM case_studies`, `case_moves`, `posts`, `content_items` 4개가 **모두 동일**하다. 드라이런이 DB 를 건드리면 드라이런이 아니다.
- **AC-3** `git log --oneline -1` 이 실행 전과 동일하다(커밋 없음).

**본실행 1회 (dry_run=false)**

- **AC-4** `drafts/cases/` 에 신규 JSON 5개가 생기고 `node scripts/case-research.mjs validate --all` 이 exit 0.
- **AC-5** `SELECT count(*) FROM case_studies WHERE created_at::date = current_date` = 5, `case_moves` 신규 ≥ 5.
- **AC-6** 신규 `case_studies.review_status` 와 `case_moves.review_status` 가 **전부 `draft`**. `approved` 가 1건이라도 있으면 FAIL(자동 승인 금지).
- **AC-7** 품질선: 신규 5건 중 **최소 3건이 등급 C 이상 무브를 2개 이상** 갖는다(M0 완료 기준과 동일 잣대). 추가로 등급 A 또는 B 무브가 **전체 3건 이상**.
- **AC-8** 음성 테스트: `metric_after` 가 채워졌는데 `case_evidence` 행이 0개인 무브가 **0건**. 픽스처로 그런 초안을 하나 넣고 돌리면 `validate` 가 exit 1 로 막고 `case-review.mjs commit` 이 거부한다.
- **AC-9** `SELECT count(*) FROM posts WHERE created_at::date = current_date` = 5, 전부 `published_at IS NULL`, `status IN ('draft','pending_review')`. `published` 가 1건이라도 있으면 즉시 FAIL.
- **AC-10** `pending_review` 인 초안은 그 소재 무브가 `review_status='approved'` 인 것만이다(SQL 조인으로 확인).
- **AC-11** CG-1 음성 테스트: 등급 C 무브를 인용하면서 귀속 문구를 뺀 초안을 픽스처로 넣으면 `status='draft'` 로 저장되고, 해당 스텝이 `blocked` + `blocker` 비어있지 않음, 종료코드 4 가 `run.json` 에 기록된다.
- **AC-12** `reports/2026-MM-DD/DIGEST.md` 가 존재하고 TL;DR·스코어보드·병목 진단·개선 방안·다음 주 주목 지표 **5개 헤딩이 모두** 있다. 다이제스트에 적힌 조사 건수·초안 건수가 AC-5/AC-9 의 SQL 실측과 **일치**한다.
- **AC-13** DIGEST 최상단에 `붙여넣기 대기: N건` 이 있고, `reports/.../decision-log-entries.md` 의 엔트리 수와 N 이 같다.
- **AC-14** `reports/status/DASHBOARD.md` 가 이번 `run_key` 를 보여주고, `SELECT * FROM agent_run_steps WHERE run_id=...` 의 행 수가 대시보드 스텝 수와 같다.
- **AC-15** 라이브성: S2 가 끝난 시점에 STEP_SUMMARY(또는 `agent_run_steps`)에서 S0·S1·S2 상태를 **실행 종료 전에** 읽을 수 있다. 실행이 끝나야만 보이면 FAIL.
- **AC-16** 커밋 화이트리스트 음성 테스트: 런북이 `methodology/` 아래 파일을 수정하도록 픽스처를 주면, 워크플로가 **커밋하지 않고 실패**한다. 커밋이 나가면 FAIL.
- **AC-17** 피드백: `reports/feedback/` 에 `status: open` 파일 1개를 두고 실행 → DIGEST 에 반영 내역 1건 + 그 파일 프론트매터가 `status: ingested` 로 바뀐다.
- **AC-18** 발행 경로 부재: `grep -rn "graph.threads.net" scripts/cmo-*.mjs scripts/agent-status.mjs scripts/status-render.mjs` 가 0건. 워크플로 env 에 `THREADS_ACCESS_TOKEN` 이 **없다**.
- **AC-19** 실패 주입: `SUPABASE_SERVICE_ROLE_KEY` 를 비우고 실행 → exit ≠ 0, 대시보드가 해당 스텝을 `failed` 또는 "확인 불가"로 표시. `ok` 나 `skipped` 로 찍히면 FAIL.
- **AC-20** 총 실행 90분 이내, 조사 대상 6곳 이상을 시도한 흔적 없음(`research_queue` 오늘 `in_progress`+`done` ≤ 5).

**CTO (b) PMF 파이프라인 (터미널 수동 1회)**

- **AC-21** `node scripts/pmf-assess.mjs --input fixtures/pmf-sample.json` 이 사분면 라벨과 두 축 값을 출력하고 `pmf_assessments` 1행을 만든다. **단일 점수를 헤드라인으로 출력하지 않는다.**
- **AC-22** 음성 테스트: 패싯을 비운 입력으로 돌리면 `match_status='not_run'` 으로 저장되고 `quadrant IS NULL` 이며 화면에 사분면이 표시되지 않는다.
- **AC-23** 선례가 진짜 없는 병목으로 돌리면 `no_match`(exit 1)로, 테이블 미적용 상태면 `not_run`(exit 2)로 갈린다. 둘이 같은 "0건"으로 보이면 FAIL.

**역할 정의**

- **AC-24** `ops/roles/_principles.md` 의 원칙 문구가 리포 전체에서 **1곳에만** 존재한다(`grep -c` 로 확인). 복사본이 있으면 FAIL.
- **AC-25** `/cmo` 진입점을 터미널에서 실행하면 헌장을 읽고, 첫 응답에 **질문 또는 개선 제안이 최소 1개** 포함된다(ceo-staff 는 "단순 보고 금지" 규약상 필수).

---
