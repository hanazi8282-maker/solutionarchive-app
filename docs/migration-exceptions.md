# 마이그레이션 적용 원칙의 예외 이력

> `CLAUDE.md §10.1` 은 "마이그레이션 적용은 사람이 한다"고 정한다. 이 문서는 남헌이 1회성으로 예외를 승인해 클로드코드가 직접 적용한 이력이다.
> 원칙 문구는 바뀌지 않았다. 새 예외가 생기면 여기에 덧붙이고, `CLAUDE.md` 에는 넣지 않는다 — 모든 역할 세션이 시작할 때 읽는 파일이라 이력이 쌓일수록 세션 시작 비용이 커진다 (2026-09-15 기준 이 절만 약 4,000자로 CLAUDE.md 의 27%였다).


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
