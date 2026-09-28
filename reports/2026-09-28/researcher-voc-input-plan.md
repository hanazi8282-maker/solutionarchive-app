# 리서처 VOC 입력 경로(P1) — 작업 범위·예상 소요 (첫 산출물)

작성 2026-09-28 · 남헌 지시(09-28): "리서처가 웹 기사뿐 아니라 손님 후기(VOC)도 케이스 입력 재료로 받게 설계·구현한다. 먼저 범위·소요시간을 보고하라."

- 선행 정본: `reports/2026-09-28/case-approval-linkage-design.md`(연결 설계, 이하 "연결 설계") §2 전제 P1 · `docs/case-approval-automation-roadmap.md` §2-2 "연결 재료가 있다".
- 브랜치 `feat/researcher-voc-input`. 서브에이전트 작업이라 **DB 를 직접 만지지 않는다**(CLAUDE.md §10.1) — 코드·파일만. DB 를 읽는 코드는 오케스트레이터 경로(`scripts/cmo-daily.mjs` 가 자식으로 띄우는 스크립트)에만 둔다.
- 동시 진행 중인 `feat/case-auto-approval` 이 같은 테이블을 읽는다. **테이블·컬럼 이름은 연결 설계 §5-1 그대로** — `case_move_inputs(case_move_id, input_id, linked_by, created_at)`.

## 0. 결론 먼저 — 예상 소요 **총 6.5시간** (아래 §5 작업별 내역)

- 리서처는 DB 없이 그대로 둔다. **오케스트레이터가 조사 직전에 VOC 를 파일로 뽑아 주고**(`ops/state/voc-inputs/`, git 제외), 리서처는 그 파일을 Read 해서 무브마다 `voc_inputs: [input_id…]` 를 적는다.
- 적립(`case-review.mjs commit`)이 `case_move_inputs` 에 INSERT 한다. 테이블이 없으면 **경고하고 건너뛴다**(3상태 — 적립 자체는 막지 않는다).
- 마이그레이션 파일 `supabase/migrations/20260930000028_case_move_inputs.sql` + `_rollback.sql` — **미적용**. 적용은 역할 세션 또는 남헌(§10.2).
- 승인 주체는 바꾸지 않는다. 이 PR 은 "재료가 흐르는 길" 만 만든다.

## 1. VOC 가 리서처에게 닿는 길

현재: `sa-cmo-researcher` 도구는 `Read,Grep,Glob,WebSearch,WebFetch,Write,Bash(node scripts/case-research.mjs:*)` (`cmo-daily.mjs:133`). DB 자격증명은 env 화이트리스트로 차단(`buildAgentEnv`). 큐 행에는 `project_id` 가 없고 대부분 `brand_name='미정 (SaaS · …)'` 플레이스홀더다 — 리서처가 브랜드를 스스로 고른다.

선택한 형태 — **오케스트레이터 선(先)내보내기 + 리서처 자기 매칭**:

1. `scripts/voc-export.mjs`(신규, DB **읽기만**): 관련성 판정이 `relevant` 인 입력을 프로젝트별로 모아 파일로 쓴다.
   - `ops/state/voc-inputs/index.md` — 프로젝트 1줄씩: `project_id · competitor_url · 시장 · 사업모델 · 병목 · 관련 VOC n건`.
   - `ops/state/voc-inputs/<project_id>.json` — 그 프로젝트의 VOC 목록 `{ input_id, text(≤400자), labels{impact,frequency,community_signal,wtp_mentioned}, verdict_by('human'|'auto'|'llm'), collected_at }`.
2. `cmo-daily.mjs` S2 `research` 스텝 첫머리에서 위 스크립트를 `sh()` 로 돌린다(별도 스텝을 추가하지 않는다 — 10스텝 계약 유지). 결과는 스텝 `detail.voc_export` 에 3상태로 남긴다: `written(n projects)` / `none(0건 — 조회 정상)` / `unavailable(<사유>)`. 내보내기 실패는 조사를 막지 않는다 — VOC 없이 조사하되 그 사실이 DIGEST 에 남는다.
3. `researchPrompt()` 가 `index.md` 가 **있을 때만** 안내 줄을 넣는다(이식성 피드백 파일과 같은 패턴, `cmo-daily.mjs:1839`). 없는 파일을 Read 하라고 시키면 조사원이 실패로 보고한다.
4. 리서처: `index.md` 를 Read → 맡은 브랜드(또는 "미정" 이면 index 의 프로젝트 중 하나를 골라도 된다)와 맞는 `<project_id>.json` 을 Read → 무브의 주장을 실제로 받치는 목소리만 `moves[i].voc_inputs` 에 **input_id 로만** 적는다.

큐에 `project_id` 를 싣는 안(연결 설계 §2 문장)은 채택하지 않았다: 큐 행 대부분이 플레이스홀더라 project_id 를 넣을 시점에 브랜드가 없다. 파일 index 는 그 문제를 리서처의 선택 시점으로 미룬다. 큐 스키마 변경 0.

**왜 git 에 넣지 않나**: 이 리포는 공개다(CLAUDE.md §2). 리뷰 원문은 30일 뒤 purge 하는 데이터라 커밋하면 purge 가 무의미해진다. `ops/state/voc-inputs/` 를 `.gitignore` 에 넣는다(`git add -- ops/state/` 는 ignore 된 파일을 집지 않는다). 초안 JSON 과 조사 노트에는 **input_id 만** 적고 원문을 붙여 넣지 않는다 — 프롬프트와 에이전트 문서에 명시.

## 2. 초안이 어느 입력을 썼는지 기록하는 법

- `drafts/cases/<slug>.json` → `moves[i].voc_inputs: string[]`(uuid). 케이스 단위가 아니라 **무브 단위**다(승인 단위 = 무브, 연결 설계 §3 안 B).
- `evidence[]` 는 그대로 URL 전용이다. VOC 는 수치 근거가 아니다 — `factCheckGrade`·`gradeMove` 산식에 들어가지 않는다(연결 설계 §3 A 의 등급 오염을 피한다).
- `validateDraft`(`lib/cases/draft.ts`): `voc_inputs` 가 있으면 배열·uuid 형식·무브 안 중복을 검사(error). 비어 있거나 없으면 아무 말 없음(VOC 없는 케이스는 정상이다).
- `toRows()` 는 `voc_inputs` 를 `case_moves` 행에 넣지 않는다(컬럼이 없다). 대신 `moves[i].voc_inputs` 를 그대로 돌려줘 commit 이 쓴다.
- `case-review.mjs commit`: 무브 INSERT 뒤 `case_move_inputs` 에 `{case_move_id, input_id, linked_by}` INSERT. `linked_by` = `--by` > `draft.researched_by` > `'sa-cmo-researcher'`.
  - 테이블 없음(42P01/PGRST205) → "⚠️ 마이그 000028 미적용 — 연결 n건을 저장하지 못했다" 를 크게 찍고 계속(적립은 성공, 연결만 누락). 다른 축(`is_issuer_defined_metric` 등)과 같은 취급.
  - FK 실패(23503, 없는 input_id) → 그 행만 건너뛰고 건수를 찍는다. 조용히 0건으로 접지 않는다.

## 3. 선택 규칙 · 프라이버시 · purge

- 포함: `coalesce(human_verdict, verdict) = 'relevant'`. 즉 사람이 `relevant` 라 했거나, 사람 판정이 없고 LLM 이 `relevant`. `human_verdict IN ('irrelevant','unknown')` 은 LLM 이 뭐라 했든 제외. `auto_approved_at` 은 `verdict_by='auto'` 표시로만 쓴다(포함 조건을 넓히지 않는다).
- 제외: `raw_text IS NULL`(purge 됨) · `source_type <> 'review'`.
- 상한: 프로젝트당 30건(정렬 `impact` high→mid→low→NULL, 그다음 `collected_at` 최신), 본문 400자 절단. 파일 크기와 리서처 컨텍스트를 같이 지킨다.
- 프라이버시: `analysis_inputs` 에 작성자 컬럼은 없다. `source_key`(소스별 식별자·URL 조각)는 **내보내지 않는다**. 원문은 파일에만 있고 git 밖이며, 초안·노트에는 id 만 남는다.
- purge 창: 30일 뒤 `raw_text` 가 NULL 이 되면 다음 내보내기부터 자동으로 빠진다. 이미 적립된 연결(`case_move_inputs`)은 남는다 — 판정 행(`review_relevance_verdicts`)은 purge 와 무관하게 남으므로 자동 승인 계산에는 지장 없다(연결 설계 §5-3 뷰는 판정 행만 조인한다).
- 내보내기 파일은 매 실행이 통째로 다시 쓴다(이전 파일 삭제 후 생성) — 오래된 원문이 로컬에 쌓이지 않는다.

## 4. 스키마

- `supabase/migrations/20260930000028_case_move_inputs.sql` — 연결 설계 §5-1 그대로(테이블 1개 + 인덱스 1개 + RLS ENABLE/FORCE + COMMENT). 🟢 비파괴, §10.2 예외 5개 해당 없음. **미적용**.
- `_rollback.sql` — `DROP TABLE IF EXISTS`. 연결은 초안 JSON 에서 다시 commit 하면 복원된다.
- §5-2 표시·승인 컬럼(`auto_candidate_at` 등)은 **이 PR 에 넣지 않는다** — `feat/case-auto-approval` 몫.
- 번호: 현재 최댓값 000027 → 000028. (000025 는 비어 있지만 건너뛴다 — 다른 브랜치가 쓰고 있을 수 있다.) 동시 브랜치가 같은 번호를 잡으면 머지 순서 뒤쪽이 번호를 옮긴다.

## 5. 작업 분해·예상 소요 (총 6.5h)

- T1 이 계획서 + 브랜치·드래프트 PR — 0.5h ✅
- T2 마이그레이션 + 롤백 파일 — 0.5h
- T3 `scripts/voc-export.mjs`(선택·정렬·절단 순수 함수 분리, 파일 쓰기, `.gitignore`) — 1.5h
- T4 초안 스키마·검증(`lib/cases/draft.ts` Move 타입·`validateDraft`·`toRows`, `case-research.mjs` brief/scaffold 안내) — 0.75h
- T5 리서처 프롬프트(`researchPrompt` VOC 줄) + `.claude/agents/sa-cmo-researcher.md` 규칙 — 0.5h
- T6 적립 경로(`case-review.mjs commit` → `case_move_inputs` INSERT, 3상태 가드) — 0.75h
- T7 `cmo-daily.mjs` S2 배선(내보내기 사전 실행·detail 기록) — 0.5h
- T8 셀프테스트(`voc-export-selftest.mjs` + `case-pipeline-selftest.mjs` 항목 추가) · `build-check.yml` 배선 · tsc/eslint — 1.0h
- T9 최종 보고 — 0.25h

## 6. 위험

- **연결이 0건으로 남을 위험**: 큐가 SaaS 우선인데 VOC 는 소비재(다나와)가 대부분이다. index 에 맞는 프로젝트가 없으면 리서처는 VOC 없이 조사한다 — 정상이고, 로드맵 2단계 진입 조건("연결 ≥3건 무브 ≥20건")이 늦어질 뿐이다. SaaS VOC(HN 4,022건)가 판정을 거쳐야 재료가 된다.
- **리서처가 무관한 VOC 를 붙일 위험**: 프롬프트가 "무브의 주장을 실제로 받치는 것만" 이라 하지만 강제는 없다. 자동 승인 규칙 `ca-v1` 조건 2(연결 전부 승인)가 무관 VOC 를 거르는 유일한 기계 장치이고, 사람 채점(`/cases/grade`)이 나머지다. 이 PR 은 승인에 아무 영향이 없다.
- **원문 유출**: 리서처가 조사 노트(`reports/<날짜>/research/*.md`, 커밋됨)에 리뷰 원문을 인용할 수 있다. 프롬프트·에이전트 문서로 금지하고, 파일은 git 밖에 둔다. 코드 강제는 없다(리서처 출력을 기계가 검사하지 않는다) — 후속으로 `validateDraft` 가 `voc_inputs` 옆에 텍스트 필드가 오면 거부하게 할 수 있다.
- **마이그 번호 충돌**: `feat/case-auto-approval` 이 000028 을 같이 쓸 수 있다. 머지 뒤쪽이 번호를 옮긴다(파일명만 바뀌고 내용은 무관).
- **테이블 미적용 상태 장기화**: commit 이 경고만 하고 넘어가므로, 적용 전에 적립된 케이스의 연결은 **초안 JSON 에만** 남는다. 적용 뒤 `case-review.mjs` 에 `relink --slug` 같은 재연결 명령이 필요할 수 있다 — 이 PR 범위 밖(YAGNI, 적용 시점에 판단).
- **tsc/eslint**: 워크트리에 `node_modules` 가 없다. 본체 `node_modules` 를 junction 으로 붙여 돌린다. 안 되면 "못 돌렸다" 로 보고한다.
