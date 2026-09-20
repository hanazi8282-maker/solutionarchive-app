# 마이그레이션 적용 이력

> **2026-09-17 개정** — `CLAUDE.md §10.2` 가 "남헌 승인을 받은 대화형 세션은 적용할 수 있다"로 바뀌었다.
> 그러므로 이 문서는 더 이상 "예외" 모음이 아니라 **적용 이력**이다.
>
> - 아래 2026-09-15 까지의 6건은 개정 전, "사람만 적용"이 원칙이던 시기의 **1회성 예외** 기록이다.
> - 2026-09-17 이후의 적용은 예외가 아니라 §10.2 절차(승인 → 사전 실측 → 적용 → 양성·음성 검증)를 따른 정상 경로다. 같은 형식으로 이어 쌓는다.
> - 무인 루프와 서브에이전트는 개정 후에도 적용하지 않는다. 바뀐 것은 대화형 세션의 자리뿐이다.
>
> **2026-09-20 재개정** — 대화형·역할 세션은 건마다 승인을 받지 않고 **자체 판단**으로 적용한다(§10.2 예외 5개 제외).
> 이 문서의 "승인자" 칸에는 그때부터 `자체 판단(예외 아님: <이유>)` 또는 `남헌` 을 적는다. 기록은 Notion 일일 상태 로그에도 남긴다.
>
> 이력은 `CLAUDE.md` 에 넣지 않는다 — 모든 역할 세션이 시작할 때 읽는 파일이라 이력이 쌓일수록 세션 시작 비용이 커진다 (2026-09-15 기준 이 절만 약 4,000자로 CLAUDE.md 의 27%였다).


2026-09-10, 남헌 명시적 승인 — 위 "마이그레이션 적용" 원칙(사람이 대시보드에서
직접 실행)에 대한 1회성 예외. 마이그레이션 4건(20260910000003~000005, 그리고
사전 적용 확인된 000001~000002)을 클로드코드가 이 세션에서 직접 적용함(대상:
solutionarchive 프로젝트 qmgrfqjfxqhxuufrnkwf, 적용 전 연결 확인 완료). 이후
마이그레이션은 별도 승인이 없는 한 다시 원칙대로 사람이 적용한다.

2026-09-11, 남헌 명시적 승인 — 같은 원칙에 대한 1회성 예외 재승인. **이번 3건에
한정**한다. 마이그레이션 3건을 클로드코드가 이 세션에서 직접 적용함:

- `20260911000002_analysis_angles_adaptation_suggestion.sql`
  — `analysis_angles.adaptation_suggestion` (text, nullable) 컬럼 추가
- `20260911000003_failed_angles.sql`
  — `failed_angles` 테이블 신규 + 시드 6건(RLS 활성, 정책 없음)
- `20260911000004_validated_angles_corpus.sql`
  — `validated_angles_corpus` 테이블 신규(RLS 활성, 정책 없음)

파일 출처 커밋: `89539ff` (origin/main, 적용 시점 HEAD `812e076`). 대상:
solutionarchive 프로젝트 `qmgrfqjfxqhxuufrnkwf` — 같은 조직의 dothegy-os
(`hrplbrstntyanzwxcsft`)와 혼동하지 않도록 적용 전 프로젝트 목록 조회로 확인함.
한 건씩 적용 후 즉시 검증(양성·음성 전부)했고, 기존 데이터(`analysis_angles` 13,
`review_sources` 3, `strategy_principles` 23)는 적용 전후 동일함을 확인함.

2026-09-12, 남헌 명시적 승인 — 같은 원칙에 대한 1회성 예외. **이번 1건에 한정**한다.
마이그레이션 1건을 클로드코드가 이 세션에서 직접 적용함:

- `20260912000001_onboarding_quiz_responses.sql`
  — `onboarding_quiz_responses` 테이블 신규(RLS 활성·정책 없음, 인덱스 3개).
    기존 테이블을 바꾸거나 지우지 않는다.

적용 전 `list_projects` 로 대상이 solutionarchive(`qmgrfqjfxqhxuufrnkwf`)이고
dothegy-os(`hrplbrstntyanzwxcsft`)가 아님을 확인함 — MCP supabase 서버가 기본으로
Dothegy 를 가리키므로 매번 확인이 필요하다. 적용 직후 파일 하단에 주석으로 들어
있는 검증을 전부 실행했다: **양성 2건 통과**(start→answer→complete 3행 삽입,
완주율 쿼리 started 1·completed 1), **음성 4건 전부 거부**(모두 23514 —
`oqr_answer_shape`, `oqr_complete_shape` 2회, `..._picked_side_check`).
테스트 행 삭제 후 잔여 0행 확인. 이 테이블을 쓰는 PR #50 은 적용한 뒤에 머지했다.

2026-09-14, 남헌 명시적 승인 — 같은 원칙에 대한 1회성 예외. **이번 1건에 한정**한다.
마이그레이션 1건을 클로드코드(CEO-STAFF 세션)가 직접 적용함:

- `20260914000001_case_review_note.sql` (PR #80)
  — `case_moves` 에 `review_note`·`reviewed_by`(text)·`reviewed_at`(timestamptz), `case_studies` 에 `review_note`(text) 추가.
    ADD COLUMN IF NOT EXISTS 만, 기존 행 변경 없음. 롤백 파일 `..._rollback.sql` 동봉.

적용 전 `list_projects` 로 대상이 solutionarchive(`qmgrfqjfxqhxuufrnkwf`)이고 dothegy-os 가 아님을 확인.
적용 전 음성 확인: 새 컬럼 0개. 적용 후 검증: **양성** 컬럼 4개·타입 일치, PostgREST GET 으로 새 컬럼 조회 200
(대조군 없는 컬럼 400 42703) / **음성** `reviewed_at = not-a-time` → 22007 거부 / **기존 데이터 무변경**
case_moves approved 30·draft 30, case_studies approved 15·draft 13 (전후 동일), 새 컬럼 비NULL 0행.
참고: 이 시점 운영 앱은 로그인 없이 공개 상태라 /cases 결정 버튼이 인증 없이 열린다 — Google 로그인 PR 진행 중.

2026-09-14 (2), 남헌 명시적 승인 — 같은 원칙에 대한 1회성 예외. **이번 1건에 한정**한다.
마이그레이션 1건을 클로드코드(CEO-STAFF 세션)가 직접 적용함:

- `20260915000001_case_reader_axis.sql` (PR #87)
  — `case_studies` 에 `reader_problem`, `case_moves` 에 `transfer_note`·`preconditions`·
    `transferability`·`transferability_by`·`transferability_at`, `content_items` 에 `source_move`.
    `ADD COLUMN IF NOT EXISTS` 7개 + 부분 인덱스 1개, 전부 nullable. 롤백 파일 동봉.

적용 전 `supabase/.temp/linked-project.json` 으로 대상이 solutionarchive(`qmgrfqjfxqhxuufrnkwf`)임을
확인함 — 이 세션의 supabase MCP 는 dothegy-os 를 가리키고 있어서 MCP 를 쓰지 않고 CLI(`supabase db
query --linked -f`)로 적용했다. 파일 하단 검증을 전부 실행: **양성** 컬럼 7개·인덱스 1개 존재 /
**백필 0건** `reader_problem`·`transferability`·`source_move` 비NULL 전부 0 / **무변경** case_moves
approved 34·draft 28, case_studies approved 15·draft 15 (적용 전후 동일) / **음성** `transferability=
'MAYBE'` → 23514, `reader_problem='make but no money'` → 23514 (둘 다 ROLLBACK, 데이터 영향 없음).

**같은 세션에서 백필 1건도 남헌 승인으로 실행함** — `content_items.source_move` 17행.
값의 출처는 짐작이 아니라 `drafts/threads/*.stage.json` 에 기록된 실제 `move_id` 다(17건 전부 36자
완전 UUID, `case_moves` 존재 확인 17/17, 슬러그 교차확인 불일치 0건). 적용 후 `source_move` 채워진 행
17 / `source_case` 있는데 NULL 인 레거시 행 13. 되돌리려면 `UPDATE content_items SET source_move=NULL`.

적용·백필 후 실 DB 상대 `pickAngles` 후보가 0 → 11건이 됐고, 조사 수요 계산에서 AWARENESS 가
`보류(승인 병목)` 로 빠지고 CONVERSION·DISTRIBUTION·RETENTION·TRUST 가 수요로 올라오는 것을 확인했다.

**원칙 문구(§10.1) 자체는 변경하지 않는다. 다음 마이그레이션부터는 별도 승인이
없는 한 다시 원칙대로 사람이 적용한다.**


---

2026-09-15, 남헌 명시적 승인("RLS 감지 파일 만들고 적용까지 해줘") — 같은 원칙에 대한 1회성 예외. **이번 1건에 한정**한다.
마이그레이션 1건을 클로드코드(CEO-STAFF 세션)가 직접 적용함:

- `20260915000002_enable_rls_service_only.sql`
  — RLS 가 꺼져 있던 7개 테이블(`post_replies`, `agent_runs`, `agent_run_steps`, `research_queue`,
    `pmf_assessments`, `pmf_assessment_moves`, `notion_sync_log`)에 `ENABLE ROW LEVEL SECURITY`.
    정책은 만들지 않는다(리포 다른 테이블과 같은 "RLS ON + 정책 0 = service_role 전용"). 롤백 파일 동봉.
  — 근거: `reports/2026-09-15-code-audit.md` 4-2. 브라우저 anon 키로 이 7테이블 전 행 읽기·쓰기가 가능했다.

이번엔 supabase MCP 가 solutionarchive 프로젝트를 가리키는 것을 `list_tables` 로 확인한 뒤 MCP
`apply_migration` 으로 적용했다(이력 테이블 `schema_migrations` 에 기록됨 — 09-14 까지의 30건은 미기록,
리포트 4-1). 적용 후 어드바이저: `rls_disabled` 경고 0건(적용 전 7건), 남은 건 `rls_enabled_no_policy`
INFO 34건(의도된 상태). 서버 스크립트는 전부 service_role 이라 영향 없음.

**원칙 문구(§10.1) 자체는 변경하지 않는다. 다음 마이그레이션부터는 별도 승인이
없는 한 다시 원칙대로 사람이 적용한다.**

> ⚠️ 위 문장은 **2026-09-17 §10.2 개정으로 폐기됐다.** 여기까지가 "예외" 이력이고,
> 아래부터는 승인 절차를 따른 정상 경로 기록이다.

---

2026-09-17, 남헌 명시적 승인 — **§10.2 개정 당일이자, 개정 절차를 따른 첫 적용이다.**
마이그레이션 2건을 클로드코드(CEO-STAFF 세션)가 직접 적용함:

- `20260917000001_column_review_patterns.sql` (브랜치 `feat/column-feedback-loop`)
  — `column_review_patterns` 테이블 신규 + `content_columns.feedback_at` 컬럼 추가.
- `20260921000001_discovery_candidates.sql` (브랜치 `feat/voc-discovery-engine`)
  — `discovery_candidates` 테이블 신규. FK 3건(`review_sources.key`·`analysis_projects.id`·`agent_runs.id`).

두 파일은 적용 시점에 **이미 `main` 에 있었다** — PR #128(`feat/voc-discovery-engine`),
PR #130(`feat/column-feedback-loop`) 이 2026-09-16 에 머지됐다. 코드와 DB 가 어긋난
구간은 없다. (조사 초기에 "미머지 브랜치에만 있다"고 판단했으나 이는 오류였다.
메인 작업 트리가 `feat/review-sources-expand` 를 체크아웃 중이어서 파일이 안 보였을 뿐,
`git ls-tree origin/main` 으로 확인하니 네 파일 모두 main 에 있었다. 워크트리에서
파일을 찾았다는 사실을 "그 브랜치에만 있다"로 접으면 안 된다 — §7.1 과 같은 종류의 오류다.)

적용 전 실측: 두 테이블 미존재, 잔여 인덱스 0건, `content_columns.feedback_at` 미존재
(= 부분 적용 흔적 없음). 선행 `content_columns` 12행 확인. FK 대상 3개 전부 PK 보유.
`discovery_candidates.sql` 주석이 "`agent_runs` 가 없으면 `run_id` 한 줄을 지우고
적용하라"고 경고했으나, `agent_runs` 는 17행으로 실재해 **컬럼을 그대로 유지**했다.

MCP `apply_migration` 사용(`project_id` 명시, 반환 스키마가 SolutionArchive 것임을 확인).
`column_review_patterns.sql` 의 `BEGIN;`/`COMMIT;` 두 줄은 도구가 자체 트랜잭션을 걸어
중첩 시 바깥 트랜잭션이 조기 커밋될 수 있어 제거했다 — DDL 내용은 원문과 동일하다.

검증(§7.1 양성·음성 둘 다 실행):
- 양성 11/11 — 컬럼수 12·17, `run_id` 존재, `feedback_at` nullable=YES,
  `content_columns` 12행 무변동, `feedback_at` 채워진 행 0, 두 테이블 RLS/FORCE 전부
  true, 정책 0개, FK 3건 생성, `schema_migrations` 이력 2건 등록.
- 음성 6/6 — status CHECK · `pattern_key` UNIQUE · `accepted_needs_probe` ·
  verdict CHECK · 대소문자 중복 · `unverified_has_no_project` 전부 거절됨.
  음성 검사는 `RAISE EXCEPTION` 으로 전체 롤백해 잔존 0행을 확인했다.

---

## 2026-09-18 — `20260922000001_review_sources_okky_velog.sql` (okky · velog 소스 등록)

2026-09-17 개정(§10.2) 이후의 **정상 경로** 적용이다. 예외가 아니다.

- 승인: 남헌 명시 승인 1회(2026-09-18, "승인했으니 실제 반영해줘"). 대화형 세션(CEO-STAFF)이 적용.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 리포 정본 스키마 확인
  (`case_studies`·`agent_runs`·`content_columns`·`review_sources`·`review_targets` 5개 존재,
  Dothegy OS 발주·공장 테이블 0건).
- 방식: `supabase db query --linked -f` (CLI 2.105.0). Supabase MCP 는 이 세션에서
  `CONNECT_TIMEOUT` 으로 붙지 않았다.
- 비파괴. DDL 없음, 백필 없음 — 새 행 2개 + `review_targets.product_ref` 컬럼 주석 갱신.
  롤백 파일 있음(`..._rollback.sql`, 행을 지우지 않고 `enabled=false` 로 되돌린다).

**적용 전 실측에서 마이그레이션 파일의 기대값 오류 1건을 잡았다.**
파일 주석이 "기존 13행 → 적용 후 15행"을 기대값으로 적었는데 **실 DB 는 18행**이었다.
누락된 5개 키: `naver_blog` · `naver_cafe` · `naver_kin` · `reddit` · `youtube`
(주석이 나열한 13개는 전부 실재했다 — 빠진 것이지 틀린 것은 아니다).
그 기대값을 그대로 검증에 썼다면 **20행을 보고 "가짜 실패"를 보고했을 것이다.**
파일 하단 확인 쿼리의 기대값은 20행으로 읽어야 한다.

dry-run: `BEGIN` + 원문 + 확인 SELECT + `ROLLBACK` 으로 선행 실행 → 20행 · `okky=false` ·
`velog=false` · `ivl=4000` 확인 후 실적용.

검증(양성·음성 둘 다 직접 실행):
- 양성 — 총 20행, okky·velog 2행, 둘 다 `enabled=false` · `health='ok'` ·
  `min_interval_ms=4000` · `daily_request_cap=100`.
- 양성 — `review_targets.product_ref` 주석에 `okky`·`velog` 반영됨 **그리고**
  기존 SSRF 경고가 살아 있음(주석은 덮어쓰기라 통째로 날아갈 수 있던 자리).
- 음성 — `enabled=true` 인 okky·velog 행 0건(활성화는 남헌 결정 대기).
  전체 `enabled=true` 는 6개로 무변동: `82cook`·`bobaedream`·`damoang`·`danawa`·
  `hackernews`·`youtube`.
- `review_targets` 의 okky·velog 타깃 0건 — 등록 전이다.

**수집 실동작은 확인하지 않았다(확인 불가).** 셀프테스트 608건(okky 115 · velog 136 ·
러너 357)은 전부 픽스처 기반이라 파서를 증명하지만 통합을 증명하지 않는다(§7.1).
`enabled=false` 이고 타깃 0건이라 러너가 이 두 소스를 아예 건너뛴다. 마이그레이션 주석이
경고한 대로 실측은 전부 한국 가정용 IP 였고 Actions 러너(Azure egress) 응답은 미측정이다 —
켜는 날 dry-run 으로 응답 코드를 눈으로 보고 나서 켜야 한다.

## 2026-09-20 — 20260923000001_pmf_product_facets.sql

- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (사전 실측: content_columns·case_studies·pmf_assessments 존재 확인, 대상 컬럼 0개·seller_profiles 없음, 24 projects / 41 aspects)
- 승인자: **자체 판단(§10.2 2026-09-20 개정, 예외 아님: 전부 ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS — 삭제·데이터 변경·키·법적·사업방향 해당 없음)**
- 적용: Supabase MCP `apply_migration` — success
- 양성: 패싯 컬럼 6/6 · evidence_quotes 1/1 · seller_profiles 테이블 1/1 · 기존 41 aspects 전부 `[]` 기본값
- 음성: DO 블록에서 어휘 밖 bottleneck INSERT · price_band UPDATE 둘 다 check_violation 으로 거부(잔여 행 0, 값 NULL 유지)
- 롤백 파일: `_rollback.sql` (컬럼 DROP + 테이블 DROP — 되돌리면 사람이 넣은 패싯·인용이 사라진다)

## 2026-09-21 — 20260924000001_wtp_signals.sql

- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (사전 실측: wtp_signals 없음, analysis_projects·content_columns 존재)
- 승인자: **자체 판단(§10.2, 예외 아님: 신규 테이블 CREATE IF NOT EXISTS 1개, 기존 테이블 무변경, 가격 노출 없음 — 신호 수집만)**
- 적용: Supabase MCP `apply_migration` — success
- 양성: 테이블 1/1, 행 0
- 음성: DO 블록 — would_pay=false 인데 amount 있음 · billing='yearly' 둘 다 check_violation 으로 거부(잔여 행 0)
- 롤백: `_rollback.sql`(DROP TABLE — 신호 이력 소실)

## 2026-09-21 — 20260925000001_analysis_projects_owner_email.sql

- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (사전 실측: owner_email 컬럼 0개)
- 승인자: 남헌(후속 지시 4번 "스키마 추가만, 자율 승인 범위") → 자체 판단 적용
- 적용: Supabase MCP `apply_migration` — success
- 양성: 컬럼 1/1 · 인덱스 1/1 · 기존 24행 전부 NULL(추정 채움 없음)
- 음성: 해당 없음(제약 없는 nullable 컬럼)
- 롤백: `_rollback.sql`
