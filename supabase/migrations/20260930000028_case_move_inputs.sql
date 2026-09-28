-- 케이스 무브 ↔ 수집 입력(리뷰) 연결 테이블 — case_move_inputs
--
-- 배경: 케이스 60건의 근거는 전부 웹 URL 이고 리뷰에서 나온 것은 0건이다. 관련성 판정
--   (review_relevance_verdicts, PK input_id)을 케이스 승인으로 이어 줄 열이 케이스 테이블에 없다
--   (reports/2026-09-28/case-approval-linkage-design.md §1). 이 테이블이 그 유일한 축이다(§3 안 B).
--   재료는 리서처 VOC 입력 경로(P1)가 채운다 — reports/2026-09-28/researcher-voc-input-plan.md.
--
-- 🟢 비파괴: 신규 테이블 1개. 기존 테이블·컬럼·행 변경 없음. 백필 없음.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 손상 없음 · 인증 경계 무관 ·
--    새 수집 소스 아님(이미 받아 둔 리뷰를 가리키기만 한다) · 사업 방향 결정 아님.
--    롤백 파일 있음(`_rollback.sql` — DROP TABLE 1줄. 연결은 초안 JSON(moves[i].voc_inputs)에서 다시 commit 하면 복원된다).
--
-- 설계에서 갈린 것:
--   · case_evidence 에 input_id 를 얹지 않는다 — url NOT NULL 과 등급 산식(사실확인 A)이 오염된다(§3 안 A).
--   · case_studies 에 project_id 를 달지 않는다 — 판정 단위(입력)와 승인 단위(무브)가 안 맞는다(§3 안 C).
--   · 무브 1 : 입력 N, 같은 입력이 무브 여럿을 받칠 수 있다(N:M). PK 가 쌍이다.
--   · linked_by NOT NULL — 출처 없는 연결은 연결이 아니다. 에이전트 이름('sa-cmo-researcher') 또는 사람 이메일.
--   · 케이스 단위 연결(case_move_id NULL)은 없다 — 승인 단위가 무브라 쓸 곳이 없다(YAGNI).
--
-- ⚠️ 테이블·컬럼 이름은 연결 설계 §5-1 그대로다. 같은 이름을 feat/case-auto-approval(후보 판정 뷰)이 읽는다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260915000002).
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가 아니다).
--   사람 또는 대화형/역할 세션이 적용한다. 절차:
--     1) 대상 프로젝트가 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인.
--     2) information_schema 로 부재 확인(PostgREST head:true 는 없는 테이블에도 204 — §7.1).
--     3) 이 파일 실행 → 하단 확인 쿼리(양성·음성).
--     4) docs/migration-exceptions.md 한 줄.
--   적용 전에도 코드는 죽지 않는다: scripts/case-review.mjs commit 이 42P01/PGRST205 를 보면 경고하고 연결만 건너뛴다.

CREATE TABLE IF NOT EXISTS public.case_move_inputs (
  case_move_id uuid NOT NULL REFERENCES public.case_moves(id) ON DELETE CASCADE,
  input_id     uuid NOT NULL REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  -- 누가 이었나: 'sa-cmo-researcher' 같은 에이전트 이름 또는 사람 이메일. NULL 금지 — 출처 없는 연결은 연결이 아니다.
  linked_by    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_move_id, input_id)
);

-- 판정 조인 방향(입력 → 무브)용.
CREATE INDEX IF NOT EXISTS case_move_inputs_input_idx ON public.case_move_inputs (input_id);

ALTER TABLE public.case_move_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_move_inputs FORCE  ROW LEVEL SECURITY;  -- 정책 0개 = service_role 전용 (리포 관례)

COMMENT ON TABLE public.case_move_inputs IS
  '무브의 주장을 받치는 사용자 목소리(analysis_inputs). 근거 등급(case_evidence)과 별개 축 — 관련성 판정을 케이스 승인으로 잇는 유일한 연결. 설계: reports/2026-09-28/case-approval-linkage-design.md';
COMMENT ON COLUMN public.case_move_inputs.linked_by IS
  '연결 주체. 에이전트 이름(sa-cmo-researcher 등) 또는 사람 이메일. 리서처 초안의 researched_by 가 기본값.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ────────────────────────────────────────────────────
--   select count(*) from information_schema.tables where table_schema='public' and table_name='case_move_inputs';  -- 1
--   select relrowsecurity, relforcerowsecurity from pg_class where relname='case_move_inputs';                      -- true / true
--   select count(*) from pg_policies where tablename='case_move_inputs';                                            -- 0 (service_role 전용)
--   select count(*) from public.case_move_inputs;                                                                   -- 0 (첫 적립 전)
-- ── 음성 (롤백되는 형태로 — 데이터를 남기지 않는다) ─────────
--   begin;
--     -- 없는 무브는 FK 로 거부돼야 한다 → 23503.
--     insert into public.case_move_inputs (case_move_id, input_id, linked_by)
--     values ('00000000-0000-0000-0000-000000000000', (select id from public.analysis_inputs limit 1), 'probe');  -- 기대: ERROR 23503
--   rollback;
--   begin;
--     -- 같은 쌍 두 번은 PK 로 거부돼야 한다 → 23505.
--     insert into public.case_move_inputs (case_move_id, input_id, linked_by)
--     select m.id, i.id, 'probe' from public.case_moves m, public.analysis_inputs i limit 1;
--     insert into public.case_move_inputs (case_move_id, input_id, linked_by)
--     select m.id, i.id, 'probe' from public.case_moves m, public.analysis_inputs i limit 1;   -- 기대: ERROR 23505
--   rollback;
--   begin;
--     -- linked_by NULL 은 거부돼야 한다 → 23502.
--     insert into public.case_move_inputs (case_move_id, input_id, linked_by)
--     select m.id, i.id, NULL from public.case_moves m, public.analysis_inputs i limit 1;      -- 기대: ERROR 23502
--   rollback;
