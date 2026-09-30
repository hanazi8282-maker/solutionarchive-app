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

## 2026-09-21 — 20260927000001_rls_seller_profiles_wtp_signals.sql (RLS 활성화 + 소유자 정책)

- 배경: Supabase 어드바이저 critical `rls_disabled_in_public` 2건(seller_profiles·wtp_signals). 두 테이블은 앱에서 서버 라우트(service_role)만 쓰는데
  RLS 가 꺼져 있어 anon 키로 PostgREST 를 직접 치면 전 행이 읽혔다(실측 당시 두 테이블 모두 0행이라 노출된 데이터는 없다).
- 승인자: **자체 판단(§10.2)** — 남헌 09-21 긴급 지시. 예외 5개 해당 없음(삭제·데이터 변경·키 노출·법적·사업방향 아님, 보안 경계를 **좁히는** 변경). 롤백 파일 있음.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. Supabase MCP `apply_migration` — success.
- 접근 경로 실측: 브라우저 anon 클라이언트 import 0건, `scripts/discovery*`·`lib/discovery` 참조 0건 → 발굴 엔진 무관. `pg_roles.service_role.rolbypassrls = true`.
- 적용 전 검증: 스테이징 브랜치 없음(list_branches 0) → DO 블록 안에서 DDL+테스트 행 → 역할 전환 실측 → RAISE EXCEPTION 으로 전체 롤백.
  결과 `anon_profiles=0 anon_wtp=0 authA_profiles=1 authA_wtp=1 authA_insert_other=blocked(42501) authA_insert_own=ok authA_update_B_rows=0 authA_update_A_rows=1 authA_delete_rows=0 service_profiles=2 service_wtp=3 service_insert=ok`.
- 적용 후 양성: pg_class 둘 다 relrowsecurity/relforcerowsecurity true, 정책 5개(roles {authenticated}), 두 테이블 0행 유지(테스트 행 잔존 없음).
  앱 경로: `lib/supabase/server.ts`(service_role) select 정상. 셀프테스트 wtp 40·analyze-projects-facets 71·auth 98 통과.
- 적용 후 음성: anon 키 PostgREST GET `seller_profiles`·`wtp_signals` → `[] HTTP 200`(차단).
- 어드바이저 재조회: `rls_disabled_in_public` ERROR 0건. 남은 것 — `security_definer_view`(post_performance, ERROR) · `function_search_path_mutable` 2건(WARN) · leaked password protection(WARN) · `rls_enabled_no_policy` INFO 37건(기존 전 테이블 관례). 이번 지시 범위 밖, 별건.

## 2026-09-21 — 20260927000002_post_performance_invoker_search_path.sql (뷰 INVOKER + 함수 search_path)

- 배경: 어드바이저 `security_definer_view`(post_performance, ERROR) · `function_search_path_mutable`(guard_learning_promotion·guard_hypothesis_promotion, WARN).
  DEFINER 는 의도가 아니라 옵션 없는 `CREATE VIEW` 의 기본값. 실측: anon 키로 뷰 35행 노출(posts·metric_snapshots 는 RLS 로 막혀 있는데 뷰가 대신 읽어 줌).
- 승인자: **자체 판단(§10.2)** — 예외 5개 해당 없음(삭제·데이터 변경·키 노출·법적·사업방향 아님, 보안 경계를 좁히는 변경). 롤백 파일 있음.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 호출자 전부 service_role(loop.ts·patterns.ts·threads-report.mjs·트리거). Supabase MCP `apply_migration` — success.
- 적용 전 드라이런(DO 블록, RAISE 로 롤백): `anon_view=denied(42501) auth_view=denied(42501) service_view_24h=3 hyp=H1 n=0 expect_raise=true raised=true learn_confirmed_1_raised=true learn_candidate_ok`.
- 적용 후 양성: `reloptions={security_invoker=true}` · grantees postgres,service_role · 두 함수 `proconfig={search_path=public, pg_temp}` · service_role 뷰 35행 · 트리거 예외 문구 그대로("가설 H1 는 표본 0개로 supported 불가" / "표본 1 개로는 확정 불가").
  셀프테스트 insight-patterns·threads-collect·threads-match·insight-loop-db-guard 통과. service 키 PostgREST 200.
- 적용 후 음성: anon 키 PostgREST GET `post_performance` → `401 {"code":"42501","message":"permission denied for view post_performance"}`.
- 어드바이저 재조회: ERROR 0 · WARN 1(leaked password protection, Auth 설정) · INFO 37(기존 관례).

## 2026-09-22 — 20260928000001_remedy_verdicts.sql (처방 카드 판정 캐시)

- 승인자: **자체 판단(§10.2)** — 남헌 09-22 "권고안 E 착수" 지시. 신규 테이블 1개(CREATE IF NOT EXISTS), 기존 무변경, RLS ENABLE+FORCE 정책 0개(service_role 전용 관례). 롤백 DROP TABLE.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 사전 실측 has_table=0. MCP `apply_migration` — success.
- 양성: `scripts/remedy-judge.mjs --all --dry` 후보 58장 → 실행 적립 58행(무관 37). 결과 화면 캡션 렌더 확인.
- 음성: 해당 없음(캐시 테이블). 셀프테스트 remedy-gate 47·remedy 27·summary 27·advisor 128 통과(PR #209 CI).

## 2026-09-22 — 20260928000002/3/4_review_sources_enable_batch1~3.sql (소스 활성화 8곳)

- 승인자: 남헌 09-22 명시 지시("꺼져 있는 8곳 순차 켜기") → 자체 적용. 신규 소스 아님(전부 09-16~18 에 리스크 인지 후 등록된 행) → §10.2 "새 법적 리스크" 예외 아님. 각 3행/3행/2행 UPDATE, 롤백 파일 있음(원 disabled_reason 복원).
- 대상: solutionarchive. MCP `apply_migration` 3회 — success.
- 양성: 1차 수동 실행 신규 606건(clien 500·todayhumor 102·theqoo 4) → 2차 330건(fmkorea 323·brunch 6·tumblbug 1) → 3차 okky·velog 타깃 0(개발자 커뮤니티, SaaS 프로젝트 없음).
- 음성: robots 회피 0건, 소스 health 전부 ok. 파싱 실패 clien 6·todayhumor 1·brunch 1 은 표본 대비 소수.

## 2026-09-23 — 20260929000001_analysis_projects_competitor_url_optional.sql (competitor_url NOT NULL 해제)

- 승인자: 남헌 09-23 확정 Q4-A(수기 입력 경로 개방) → CEO-STAFF 세션 자체 적용. `DROP NOT NULL` 은 제약을 푸는 방향이라 비파괴, 기존 행 무변경, 인증 경계 무관 → §10.2 예외 5개 해당 없음. 롤백 파일 있음.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 적용 전 실측 `is_nullable=NO`. MCP `apply_migration` — success.
- 양성: `information_schema` `is_nullable=YES`, 컬럼 COMMENT 반영 확인.
- 음성: NULL INSERT 롤백 검사는 **미실행** — 자동모드 분류기가 INSERT 문을 차단했다. NULL 허용 자체는 양성 검사로 확인됐고, 앱 경로는 PR 의 `analyze-manual-input-selftest`(빈 URL 허용·reverse 400) 가 대신 검사한다.

## 2026-09-23 — 20260929000002_review_relevance_verdicts.sql (리뷰 관련성 판정 캐시 테이블)

- 승인자: 남헌 09-23 확정 Q5(관련성 판정 Gemini 야간 배치) → CEO-STAFF 세션 자체 적용. 신규 테이블·삭제 없음·백필 없음·RLS ENABLE+FORCE·정책 0(service_role 전용) → §10.2 예외 5개 해당 없음. 롤백 파일 있음(사람 채점은 복구 불가 — 내려받고 나서).
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 적용 전 실측 테이블 없음. MCP `apply_migration` — success.
- 양성: `information_schema` 테이블·컬럼 8개·CHECK·RLS 확인.
- 음성: CHECK 위반 INSERT 롤백 검사는 **미실행**(자동모드 분류기가 INSERT 문 차단). 앱 경로는 `analyze-relevance-selftest`(3상태 파싱·unknown 접힘 금지) 가 대신 검사.

## 2026-09-23 — 20260929000003_content_columns_case_slug.sql (케이스↔칼럼 링크 컬럼 2개)

- 승인자: 남헌 09-23 확정 9/30 기능 5(칼럼 섹션) → CEO-STAFF 세션 자체 적용. `ADD COLUMN IF NOT EXISTS` 2개(NULL 허용, 백필 없음) → 비파괴, §10.2 예외 5개 해당 없음. 롤백 파일 있음(DROP COLUMN 은 되돌리기 어려운 삭제라 사람 판단 영역이라고 파일에 명시).
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 적용 전 실측 두 컬럼 없음. MCP `apply_migration` — success.
- 양성: `information_schema` 두 컬럼 nullable 확인. 음성: 기존 행 값 전부 NULL(백필 없음).
- ⚠️ `/columns/read` 공개 접두사(`lib/auth/policy.ts`)는 **이 PR 에 없다** — 세션의 자동모드 분류기가 인증 경계 확장을 차단해 남헌이 직접 넣는다(§10.2 예외 3). 그때까지 읽기 화면은 로그인 벽 뒤에 있다.

## 2026-09-24 — 20260930000011_review_source_cap_log.sql (상한 자동반영 감사 로그 테이블)

- 승인자: 자체 판단(예외 아님: 신규 테이블 1개+인덱스 1개, 삭제·백필·UPDATE 없음, RLS ENABLE+FORCE·정책 0). CEO-STAFF 세션. 롤백 파일 있음.
- 대상: solutionarchive `qmgrfqjfxqhxuufrnkwf`. 적용 전 실측 테이블 없음(information_schema 0). claude.ai Supabase MCP `apply_migration`(project_id 명시) — success. 로컬 stdio MCP 는 세션 시작 시 타임아웃이라 못 썼고, 별도 stdio 호출로 같은 프로젝트를 보는 것은 확인함.
- 양성: 컬럼 9개·인덱스 1·RLS true/true·정책 0.
- 음성: CHECK 위반 INSERT 롤백 검사 **미실행**(호스티드 MCP 는 트랜잭션 롤백 제어 불가). 앱 경로는 `scripts/review-request-cap.mjs` 가 테이블 부재 시 "반영 안 함"으로 멈추는 3상태 로직으로 대신 검사.

## 2026-09-24 — 20260930000012_fingerprint_dedupe.sql (지문 키 이행 · 교차 타깃 중복 소프트 처리)

- 승인자: 남헌 2026-09-24 2차 결정 2번 — 대량 UPDATE 도 4조건(드라이런·롤백 파일·무중단·Notion 기록) 충족 시 자율 적용 허용. CEO-STAFF 세션 적용. 롤백 파일 있음(`review_dedupe_soft_purges` 가 유일한 근거 — 지우면 복구 불가).
- 드라이런(적용 전): base 13,951 · 소프트 처리 대상 50건(hackernews 46 · danawa 3 · youtube 1) · keeper 47 · 판정 이동 후보 3.
- 대상: solutionarchive. 적용 전 인덱스·테이블 없음. `apply_migration` — success.
- 양성: 인덱스 1 · soft_purges 50행 · 그 50건 전부 purged_at 기록 · 최근 10분 purged 50(=대상 외 purge 없음) · RLS true/true·정책 0.
- 음성: verdict_moved 0 — 이동 후보 3건은 keeper 에 이미 판정이 있어 이동 안 함(설계대로). 판정 총수 860 변동 없음.
- 참고: 적용 중 수집 크론이 동시에 돌아 `analysis_inputs` 활성 행이 24,187→24,331 로 늘었다(+194 신규 적재, 이 마이그와 무관). 신규 행은 인덱스+`lib/review/store.ts` 2차 방어가 이후 처리.

## 2026-09-24 — 20260930000013_case_studies_brand_domain_backfill.sql (케이스 브랜드 도메인 백필 40건)

- 승인자: 남헌 2026-09-24 2차 결정 2번(위 4조건). CEO-STAFF 세션 적용. 롤백 파일 있음(40 슬러그 NULL 복원 — 적용 전 57건 전부 NULL 이었으므로 롤백이 정확히 원상태).
- 드라이런: `brand_domain` 컬럼 존재(마이그 000001 적용됨) · 57건 전부 NULL · 40 슬러그 중 39 일치, `hoka-specialty-retail-awareness-engine` 은 DB 에 없음(0건 UPDATE, 무해).
- 대상: solutionarchive. `apply_migration` — success.
- 양성: brand_domain NOT NULL 39 · 도메인 형식 불일치 0.
- 음성: NULL 잔여 18건 = 백필 목록 밖 17건(실패 케이스 위주: brandless·quibi·juicero 등) + hoka 1. 백필 대상이 아니므로 정상. hoka 는 슬러그 확인 후 후속.

## 2026-09-24 — 20260930000014_review_verdict_labels.sql (T2 라벨 컬럼 4개, PR #257)

- 승인자: 자체 판단(예외 아님: nullable ADD COLUMN 4개 + CHECK, 삭제·백필·UPDATE 없음). CEO-STAFF 세션. 롤백 파일 있음(DROP COLUMN 은 되돌리기 어려운 삭제라 롤백 실행은 사람 판단 영역).
- 대상: solutionarchive. 적용 전 실측 컬럼 8개(새 4개 없음). `apply_migration` — success. PR #257 코드 머지 전 적용 — 코드는 컬럼 부재 시 "라벨 미기록" 경로가 있어 순서 무관.
- 양성: 4컬럼 전부 nullable, CHECK 제약 확인, 기존 860행 라벨 전부 NULL(소급 없음, 설계대로).
- 음성: CHECK 위반 INSERT 롤백 검사 **미실행**(호스티드 MCP). 앱 경로는 analyze-relevance-selftest 87건(허용값 밖 → NULL) 이 대신 검사.

## 2026-09-24 — 20260930000015_analysis_inputs_purge_reason.sql (purged_at 사유 분리, PR #259)

- 승인자: 남헌 2026-09-24 5차 판단 4번("purged_at 을 30일 자동폐기용과 중복 정리용으로 분리, 4조건 규칙"). CEO-STAFF 세션 적용. 롤백 파일 있음(CHECK+컬럼 DROP — 000012 롤백보다 먼저 돌려야 함, 파일 주석).
- 드라이런(적용 전): dedupe 대상 50 · purged 총 50 · 그중 dedupe 50 · raw_text NULL 0(30일 폐기는 아직 한 번도 발화 안 함) · 컬럼 없음.
- 대상: solutionarchive. `apply_migration` — success.
- 양성: 컬럼 nullable · CHECK 1 · dedupe 50 · retention 0 · 불변식(purged_at NOT NULL ⇒ reason NOT NULL) 위반 0 · 역방향(reason 있고 purged_at NULL) 0 · 누적 집계(reason IS DISTINCT FROM 'dedupe') 24,920 / 총 24,970.
- 음성: CHECK 위반 UPDATE 롤백 검사 **미실행**(호스티드 MCP). 앱 경로는 review-purge-selftest 34건이 대신 검사.
- 순서 주의: PR #258 의 소스 타일 count 가 이 컬럼을 읽는다(커밋 1994580). 컬럼은 이미 적용됐으므로 #258 을 언제 머지해도 "집계 불가"로 빠지지 않는다.

### 2026-09-24 추기 — 000013 hoka 1행 후속 (남헌 7차 결정 1번 "hoka A 확정")

- 000013 적용 시 `hoka-specialty-retail-awareness-engine` 은 DB 에 행이 없어 0건 UPDATE 였다. 같은 날 PR #262(전이축 3칸 채움, 인사이트 D/D→A/A)를 `case-review.mjs commit` 으로 draft 적재한 뒤, 000013 과 같은 값(`hoka.com`, `config/brand-domains.json` status=active)으로 1행 UPDATE 를 CEO-STAFF 가 직접 실행했다(`WHERE brand_domain IS NULL` 가드, RETURNING 확인). 롤백은 000013 롤백 파일이 같은 슬러그를 포함하므로 별도 파일 없음.
- 적재 실측: case_studies 58행(57→58), hoka 무브 2(draft/A·draft/A), 근거 8, reader_problem NO_CHANNEL, brand_domain 채움 40/58. 승인은 남헌(/cases 에서 무브+케이스 둘 다).

### 2026-09-25 — 000016 `review_relevance_verdicts.labels_unavailable_reason` (미적용 — 남헌 SQL Editor)

- 목적: T2 라벨 소급을 2회 돌려도 남는 34행(평판·의견성 글, 모델이 라벨 4개를 일관되게 null 로 반환)을 "라벨 불가"로 표시해 미해결 잔여로 계속 세지 않게 한다(남헌 2026-09-25 지시).
- 비파괴(nullable ADD COLUMN 1개 + CHECK). 롤백 파일 있음. §10.2 예외 5개에 해당 없음 → 세션 자체 판단 범위이나, **자동모드 분류기가 hosted Supabase MCP `apply_migration` 을 "Production Deploy" 로 차단**해 CEO-STAFF 세션이 적용하지 못했다.
- 남헌 절차: SQL Editor 에서 마이그 파일 실행 → 아래 UPDATE 로 34행 표시 → `node --env-file=.env.local scripts/relevance-labels-backfill.mjs`(드라이런) 대상이 0행이면 양성.
  ```sql
  UPDATE public.review_relevance_verdicts v
     SET labels_unavailable_reason = 'opinion_no_pain_signal'
    FROM public.analysis_inputs i
   WHERE i.id = v.input_id AND i.purged_at IS NULL
     AND v.impact IS NULL AND v.frequency IS NULL AND v.community_signal IS NULL AND v.wtp_mentioned IS NULL
     AND (v.human_verdict = 'relevant' OR (v.human_verdict IS NULL AND v.verdict = 'relevant'))
     AND v.labels_unavailable_reason IS NULL;
  -- 기대 34행(2026-09-25 09:38 UTC 실측). 크게 다르면 그사이 야간 판정이 새 행을 만든 것이니 숫자를 확인하고 진행.
  ```
- 컬럼이 없어도 스크립트는 죽지 않는다: `relevance-labels-backfill.mjs` 가 42703 을 받으면 "마이그 000016 미적용" 경고를 남기고 옛 조건으로 대상을 고른다.

### 2026-09-25 — 000017 todayhumor 재활성화 (세션 자체 판단 적용)

- 남헌 2026-09-25 결정("마이그레이션 파일로 enabled=true 전환, DB 직접 UPDATE 금지"). `review_sources` 1행 UPDATE(enabled·health·disabled_*), 비파괴, 롤백 파일 있음, §10.2 예외 5개 해당 없음 → CEO-STAFF 세션이 hosted Supabase MCP `apply_migration` 으로 적용(이번엔 분류기 차단 없음).
- 양성 확인: `enabled=true, health=ok, disabled_at=NULL, health_checked_at=2026-09-25T12:41:13Z`.
- 재차단 여부: 재활성화 직후 `nightly-review-collect.yml` 을 `source=todayhumor, dry_run=false` 로 수동 실행(run 36136401877). 결과는 상태 로그에.

### 2026-09-25 — 000018 posts.publishing_at · published_via (세션 자체 판단 적용)

- 남헌 2026-09-25 즉시발행 버튼 착수 승인(접근안 A). nullable ADD COLUMN 2개 + CHECK, 비파괴, 롤백 파일 있음, §10.2 예외 5개 해당 없음 → CEO-STAFF 세션이 hosted Supabase MCP `apply_migration` 으로 적용.
- 양성 확인: information_schema 에 두 컬럼 존재(REST 조회). 음성: 없는 값('auto')은 CHECK 로 거부되는 것이 설계.
- 코드는 컬럼이 없으면(42703/PGRST204) **발행하지 않고** "미적용" 메시지를 돌려준다 — 이중 게시 방어 없이는 게시하지 않는다.

### 2026-09-25 — 000019 todayhumor 폐기 · 000020 content_columns 수정본 컬럼 (세션 자체 판단 적용)

- 000019: 남헌 확정(폐기). `review_sources` 1행 UPDATE, 네이버 계열과 같은 패턴(enabled=false + disabled_reason "폐기(dead)…"). 비파괴. 되살리기 = 000017 재적용.
- 000020: 칼럼 전수검수용 nullable 컬럼 5개(body_revised·revision_summary·revision_status·revised_by·revised_at) + CHECK. 원문 body 는 안 건드린다. 롤백 파일 있음. hosted Supabase MCP `apply_migration` 으로 적용, 양성 확인은 첫 검수 행 저장으로.

### 2026-09-27 — 000023 danawa 야간 수집 최소화 · todayhumor 잔여 타깃 정리 (적용 완료 — CEO-STAFF 세션 자체 판단)

- CEO-STAFF 결정: danawa 는 끄지 않는다(/analyze/new·발굴 프로브가 사람 주도 소비재 분석에 씀). active 타깃 1개 exhausted + daily_request_cap 200→30. todayhumor(000019 폐기) 타깃 3개 active→failed.
- UPDATE 5행, 각 행 id·현재값 가드, 비파괴. 롤백 파일 있음. §10.2 예외 해당 없음.
- exhausted 를 자동으로 되살리는 코드 없음(러너는 active 만 집음, discovery kill 도 되살리지 않음). cap 이 모자라면 review-request-cap 이 2배 이내에서 올린다.
- 적용: 2026-09-27 hosted Supabase MCP `apply_migration`(qmgrfqjfxqhxuufrnkwf). 양성 확인: danawa exhausted 17 · active 0 · todayhumor failed 3 · danawa cap 30 · enabled=true. 음성 검사는 hosted MCP 가 롤백 제어를 못 해 미실행(가드 조건이 재실행 시 0행이 되도록 작성됨).

### 2026-09-28 — 000024 활성 SaaS 소스 수집 상한 3배 (CEO-STAFF 세션, 남헌 지시)

- hackernews 600 · clien 462 · bobaedream 336 · 82cook 369 · okky/velog/damoang/theqoo/fmkorea 300 · brunch 150. min_interval_ms 불변. 제외: danawa·youtube·tumblbug.
- 안전 근거: 7일간 상한 도달 0·403/429 0, robots Crawl-delay ≤2s < 현재 간격. 3배가 안 되는 소스 없음.
- 적용: hosted MCP apply_migration. 양성 확인 10행 모두 새 값·간격 불변. 음성 미실행(hosted MCP 롤백 제어 불가, 현재값 가드라 재실행 0행).

### 2026-09-28 — discovery_candidates VOC 개수 기준 재분류 29건 (CEO-STAFF 세션, 남헌 지시 + AskUserQuestion 확인)

- PR #309 로 기준 자체(30/500 → 200/50,000) 변경 적용. 별도로 **기존 discovery_candidates 40건 전체를 새 기준으로 재분류**(테이블 마이그레이션 아님, 값 UPDATE).
- 사람 판정(human_review)과 겹치는 9건(killed 5·kept 4)이 있어 AskUserQuestion 으로 확인 — 남헌이 "새 기준 우선, 29건 전체 그대로 적용"으로 확정.
- 4조건: 드라이런(적용 직전 스냅샷 29건 일치 재확인) · 롤백 파일(`reports/2026-09-28/voc-thresholds/rollback.sql`) · 무중단(discovery_candidates 는 서빙 경로 없음, 읽기 전용 화면만 영향) · Notion 기록(예정).
- 적용: hosted Supabase MCP `execute_sql`(qmgrfqjfxqhxuufrnkwf). 양성 확인: `verdict_reason like '%(reclass 2026-09-28%'` → 29건. 음성 확인은 하지 않음(가드 조건 `d.verdict = v.old_verdict` 라 재실행 시 0행이 되도록 작성됨 — 롤백은 `rollback.sql` 로 원래 verdict/verdict_reason 복원).
- 주의: 살아난 19건은 project_id 없음 — 수집이 자동으로 붙지 않는다(등록은 별도). 걸러진 10건은 project_id 있는 것 4건 포함 — 기존 프로젝트·수집 데이터는 유지.

### 2026-09-28 — 되살아난 SaaS 후보 17건 수집 등록 (CEO-STAFF 세션, 남헌 지시 B)

- 재분류로 accepted 가 된 19건 중 Stripe(38,548)·Buffer(45,354) 제외 17건. 발굴 엔진 `persist()` 와 같은 규칙: analysis_projects INSERT(`collecting`·`SAAS`·purpose product_fit) + review_targets INSERT(hackernews `q:<이름>` active) + discovery_candidates.project_id 연결.
- INSERT 뿐인 비파괴 변경(§10.1 발굴 적재 범위와 같은 모양). 사전 확인: 같은 이름 프로젝트·타깃 0건. 한 트랜잭션(데이터 변경 CTE) — 결과 후보 17·프로젝트 17·타깃 17·연결 17.
- 양성 확인: 17행 전부 collecting·SAAS·hackernews·active 로 재조회. 되돌리기: `reports/2026-09-28/voc-thresholds/register-17-rollback.sql`(1단계 수집 중지, 2단계 삭제는 입력 0건 확인 뒤).
- 영향: 다음 수집 슬롯부터 HN 타깃 27→44. 이 17개가 첫 추출(신규 ≥100) 문턱을 넘으면 SaaS 우선 정렬로 extract 대기열 앞에 선다.

### 2026-09-28 — 000028 case_move_inputs · 000029 케이스 자동승인 컬럼 · 000030 케이스 숨김 컬럼 (CEO-STAFF 세션 자체 판단 적용)

- 셋 다 추가만 하는 비파괴 변경(새 테이블 1·nullable 컬럼 8·부분 인덱스 2). 기존 행 변경 0, 백필 없음. §10.2 예외 5개 해당 없음. 롤백 파일 각각 있음.
- 적용 이유: 000030 은 케이스 자동승인 가동 전제 (c)(관리자 삭제 기능)의 실제 준비 — 없으면 숨김 버튼이 "마이그 미적용"만 돌려준다. 000028 은 리서처 VOC 연결이 오늘부터 DB 에 쌓이게(미적용이면 초안 JSON 에만 남는다). 000029 는 자동승인 컬럼 — 플래그 `CASE_AUTO_APPROVAL_STAGE` 기본 off 라 쓰는 코드는 돌지 않는다.
- 적용: 로컬 supabase MCP `apply_migration`(qmgrfqjfxqhxuufrnkwf — content_columns·agent_runs·case_studies 존재로 대상 확인, 적용 전 information_schema 로 부재 확인).
- 양성: case_move_inputs 존재·FORCE RLS·정책 0 · case_studies 5컬럼 · case_moves 3컬럼 · 값이 채워진 기존 행 0. 음성: 없는 case_move_id 로 INSERT → 23503 FK 거부(저장 0).
- 코드 PR: #317(000028) · #318(000029) · #319(000030), 전부 머지.

### 2026-09-28 — 000027 T2 2차 판정 컬럼(뒤늦은 적용) · 000031 정보성 컬럼 · 000032 기준 피드백 메모 (CEO-STAFF 세션 자체 판단 적용)

- 000027: PR #311(09-28 머지) 때 "미적용"으로 남긴 뒤 누락 — 000028~030 이 먼저 들어가 순서가 어긋났다(architect 실측으로 발견). 자동승인 플래그 off 라 영향 0. 적용 뒤 5컬럼·채워진 행 0 확인, 음성: second_verdict='maybe' UPDATE → 23514 CHECK 거부.
- 000031(PR #324): review_relevance_verdicts 에 product_informative · second_product_informative · human_product_informative(nullable boolean). 양성 3컬럼 boolean · 채워진 행 0.
- 000032(PR #323): relevance_criteria_feedback 새 테이블, FORCE RLS·정책 0. 음성: 공백 메모 INSERT → 23514 거부.
- 셋 다 추가만 하는 비파괴 변경, §10.2 예외 해당 없음, 롤백 파일 있음. 로컬 supabase MCP apply_migration(qmgrfqjfxqhxuufrnkwf).
### 2026-09-27 — 000021 published_via 'external' 허용 · 000022 외부 게시물 4행 백필 (세션 자체 판단 적용)

- 근거: 남헌 2026-09-27 확정 — 대시보드 "미연결" Threads 게시물 4건(가장 오래된 것 78시간)은 CMO 파이프라인 산출물이 아니라 별도 Claude 세션 첨삭본. "수동/외부 발행" 출처로 등록해 통계 반영 + 미연결 해소. 마이그레이션은 4조건(드라이런·롤백 파일·무중단·Notion 로그) 충족 시 자율.
- 000021: `posts_published_via_check` 를 DROP→ADD 로 넓힘(instant·manual → +external). 기존 값 전부 통과, 비파괴, 롤백 파일 있음. §10.2 예외 5개 해당 없음(삭제 없음·기존 행 손상 없음·키 무관·법적 무관·사업 방향 아님).
- 000022: INSERT 4행(ON CONFLICT DO NOTHING, 멱등). 본문은 GET /me/threads 발행본 그대로, content_code·hook_type 은 추측하지 않고 NULL, topic_tag 는 기존 T3-1 과 같은 "빌드인퍼블릭". 롤백 = 그 4행만 DELETE.
- 방식: `supabase db query --linked -f` (CLI 2.105.0, 프로젝트 `qmgrfqjfxqhxuufrnkwf` 확인). Supabase MCP 는 CONNECT_TIMEOUT.
- 드라이런: BEGIN → 000022 → count → ROLLBACK 으로 4행/총 46행 확인 뒤 잔존 0행 확인. 그 다음 실적용.
- 양성: `published_via='external'` 4행(char_count 477·392·465·494, channel 귀속 O). 매처 즉시 1회 실행 → `agent_run_steps.threads_unlinked counts.unlinked` 4 → 0 (threads_checked 6).
- 음성: 000021 제약 정의를 다시 읽어 3값만 허용됨을 확인. 잘못된 값('auto') 삽입 거부 테스트는 분류기가 프로덕션 쓰기로 막아 **돌리지 못했다** — CHECK 정의 텍스트로만 확인.
- Notion 일일 상태 로그: 세션 종료 시 기록(§11). 로컬에 NOTION_API_TOKEN 이 없어 MCP 불가 시 `ops/state/status-log-pending/` 에 남긴다.

### 2026-09-28 — 000026 디스콰이엇 · 000025 Product Hunt(+활성화·타깃 34) · 000033 차단 카운트 컬럼 · 000034 램프 테이블 (CEO-STAFF 세션, 남헌 확정 지시)

- 000026(PR #305): review_sources 'disquiet' 활성 1행 + board:feed 타깃 1. 약관 리스크는 남헌이 인수(09-28). 실수집 run 36428890518: 파싱 19·실패 0·신규 19·차단 0.
- 000025(PR #302): 'producthunt' 행(파일은 enabled=false) 적용 뒤 남헌 지시로 enabled=true·disabled_reason NULL UPDATE + review_targets 34행(SaaS 25개 제품 런칭글, Fly.io 동명 의심·Figma 미발견 제외). 시험 run 36427238079: **Actions 러너에서 api.producthunt.com/robots.txt 가 403 → fail-closed 로 요청 0건**(로컬 09-28 실측은 200). 수집 0건 — 사람 판단 대기.
- 000033(PR #328): review_collection_runs.blocked_responses·quota_responses int NOT NULL DEFAULT 0(메타데이터 변경). 000034: review_source_ramp·review_source_ramp_log(FORCE RLS·정책 0). 양성: 컬럼 2·테이블 2·정책 0. 음성: level=5 INSERT → 23514 거부.
- 전부 비파괴(INSERT/ADD/CREATE), 롤백 파일 있음. 로컬 supabase MCP apply_migration.

### 2026-09-29 — 000035 발굴 이식성 판정 컬럼 (CEO-STAFF 세션, 남헌 확정 지시 "리스크 낮으면 바로 구현")

- 000035(PR #339): discovery_candidates 에 transfer_verdict·transfer_lesson·transfer_reason·human_note(nullable) + CHECK(pass|fail|unverified|NULL). 적용 전 부재 확인(0컬럼). 양성: 4컬럼, 기존 40행 중 변경 0. 음성: transfer_verdict='maybe' → 23514 거부, 잔존 0. 비파괴, 롤백 파일 있음. 호스티드 Supabase MCP apply_migration. 게이트 기본값 shadow(교정 20/27 < 기준).

### 2026-09-29 — 000036 채점 화면 번역·제품 배경 캐시 (CEO-STAFF 세션, 남헌 확정 지시)

- 000036(PR #340): relevance_translations·relevance_product_backgrounds 신규 + 원문 폐기 추종 트리거. 서브에이전트가 000035 로 만들었으나 발굴 이식성(#339)과 번호 충돌 → 000036 으로 재번호. 적용 전 부재 확인. 양성: 컬럼 11/7·RLS true/true·정책 0·search_path 고정·트리거 O. 음성 3건 23514 거부, 트리거(원문 NULL → 번역 행 삭제) 0, 잔존 0(세이브포인트 롤백). 비파괴, 롤백 파일 있음. 호스티드 Supabase MCP apply_migration.

### 2026-09-29 — 000037 경쟁사 프로필 스냅샷 (CEO-STAFF 세션, 남헌 확정 지시)

- 000037(PR #345): competitor_profile_snapshots 신규(project FK CASCADE, status ok|unverified|failed, trigger extract|backfill|manual). 적용 전 부재 확인. 양성: 컬럼 17·RLS true/true·정책 0. 음성 3건(ok+sections NULL · failed+sections · trigger='cron') 23514 거부, 잔존 0. 비파괴, 롤백 파일 있음. 호스티드 Supabase MCP apply_migration. nightly-extract timeout 75→120분(남헌 승인).

### 2026-09-29 — 000038 posts.pillar (CEO-STAFF 세션, 남헌 확정 지시)

- 000038(PR #355): posts.pillar nullable + CHECK(케이스|숫자한줄|빌드로그|VOC발굴|NULL). 양성: 컬럼 1. 음성: pillar='기타' → 23514 거부. 적용 전 non-null 0. 이어서 발행 8편 소급(빌드로그 5·케이스 3), post_decision_link 1행(T3-1 → LOG-20260907-02) 멱등 INSERT. 비파괴, 롤백 파일 있음. 호스티드 Supabase MCP apply_migration. POSTS_PILLAR_COLUMN_READY=true.

### 2026-09-30 — 000039/000040 insight_grade (CEO-STAFF 세션, 남헌 확정 B안)

- 000039(case_moves.insight_grade + CHECK) 는 2026-09-29 오케스트레이터가 적용(prod), 000040 백필(125/125, evidence_grade 와 불일치 0건, CHECK negative 23514 확인)도 오케스트레이터가 실행 완료. `regrade --dry` 는 insight 변경 0건을 확인했다. 이 세션은 `INSIGHT_GRADE_COLUMN_READY=true` 로 전환하고, 랭킹(gradeRankOf 1순위·pmf_grade 는 동점 결정자)을 match.ts·library.ts·detail.ts·advisor.ts 에 반영했다(PR #356).

### 2026-09-30 — 000041 velog 게시판 타깃 (CEO-STAFF 세션, 자체 판단)

- 000041(analysis_projects 4행 + review_targets 4행 INSERT, 생산성 타깃 1행 재개)을 오케스트레이터가 호스티드 Supabase MCP 로 적용했다(PR #360 머지 뒤). 자체 판단 근거: DDL 0줄 · DELETE 없음 · 새 소스 아님(velog 는 기존 enabled) · 롤백 파일 있음 · 재실행 안전.
- 적용 전 실측: velog enabled=true, 새 타깃 0건, board:productivity=exhausted. 적용은 예상 행 수(프로젝트 4·타깃 4·active 5)가 다르면 롤백되는 검증 블록과 한 트랜잭션.
- 적용 후 양성: velog 타깃 active 5(전 exhausted 1), 새 4개 fresh·business_model SAAS. 음성: velog 밖 소스별 상태 집계가 적용 전과 동일.

### 2026-09-30 — 000042/000043 dev.to·인프런·요즘IT 등록 (CEO-STAFF 세션, 남헌 명시 승인 하 적용)

- 000042(review_sources 3행 INSERT: devto·inflearn·yozm, enabled, 간격 6000ms, 일 상한 60/40/40)와 000043(analysis_projects 3행 + review_targets 3행 INSERT)을 PR #371 머지 뒤 호스티드 Supabase MCP 로 한 트랜잭션에 적용했다. 승인: 남헌 2026-09-30 — 법적 조항 인지 상태에서 기술적으로 수집 가능한 소스는 진행(`docs/risk-log.md`). §10.2 예외 4번(새 법적 리스크)에 걸리는 건이라 세션 자체 판단이 아니라 남헌 결정에 근거한다.
- 적용 전 실측: 세 소스·프로젝트·타깃 모두 0건. 예상 행 수(소스 enabled 3 · 프로젝트 3 · 타깃 active 3)가 다르면 롤백되는 검증 블록을 같은 트랜잭션에 넣었고 통과해 COMMIT 됐다.
- 적용 후 양성: 새 소스 3개 enabled·ok, 새 타깃 3개 active·fresh. 음성: 기존 소스별 타깃 상태는 같은 시각 수집 실행분 외 변화 없음(review_sources 전체 22 → 25).
- 같은 세션에서 velog `board:side-project` 타깃이 `failed`(수집 실행 중 요청 실패)로 나와 1행을 active 로 되돌렸다(다음 실행에서 원인 확인). 마이그레이션 파일 없음, 원인 미확인.
- 기술 접근 불가로 등록하지 않은 4곳: Indie Hackers(사용자 글 404) · Hashnode(글 호스트 봇 방어 챌린지) · 아이보스(봇 방어 챌린지) · GeekNews(CloudFront 403). 승인 범위(약관·법적 조항)를 넘는 우회는 하지 않았다.

### 2026-09-30 — 000044 Indie Hackers 편집 인터뷰 등록 (CEO-STAFF 세션, 남헌 명시 승인 하 적용)

- 000044(review_sources `indiehackers` 1행 + analysis_projects 1행 + review_targets `board:stories` 1행 INSERT)를 PR #376 머지 뒤 호스티드 Supabase MCP 로 적용했다. 승인: 남헌 2026-09-30 — "Indie Hackers 는 편집팀 인터뷰만 등록한다"(사용자 글은 404 라 불가능). 법적 조항은 인지한 상태의 강행이다(`docs/risk-log.md`). 승인 범위는 약관·법적 조항까지이고, 봇 방어 우회는 포함하지 않는다(이 소스는 방어 응답 없이 정적 200).
- 적용 전 실측: 소스·프로젝트·타깃 모두 0건. 트랜잭션 안에서 사전 상태(0/0/0)와 사후 행 수(소스 enabled 1 · 프로젝트 1 · 타깃 active 1)를 검사해 다르면 롤백되게 했고 통과해 COMMIT 됐다.
- 적용 후 양성: `indiehackers` enabled·6000ms·일 상한 40, 타깃 `board:stories` active·fresh. 음성: devto·inflearn·yozm·velog 타깃 상태는 적용 전과 동일(velog 5·devto 1·inflearn 1·yozm 1 active), review_sources 25 → 26.
- 한계(어댑터 보고): 인터뷰는 게시 직후 한 번만 읽어 본문은 전부 받지만 댓글은 거의 0개다. 댓글이 달릴 즈음에는 본문이 가입 벽 뒤로 간다.
