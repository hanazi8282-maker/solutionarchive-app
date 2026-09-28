-- T2 완전 동의 자동 승인 — review_relevance_verdicts 에 2차 판정과 자동 승인 표시를 더한다.
--
-- 근거: CLAUDE.md §10.1 "T2 완전 동의 자동 승인" 예외(남헌 2026-09-28) · 설계 reports/2026-09-28/approval-automation-design.md.
--
-- 왜 이 테이블인가(케이스 테이블이 아닌 이유): 1차·2차 판정은 input_id(리뷰 1건) 단위다. case_studies / case_moves 에는
--   input_id 로 이어지는 컬럼이 없다(마이그 전체 grep — 케이스는 브랜드 조사에서 나오고 리뷰에서 나오지 않는다).
--   그래서 "input_id 두 판정 완전 동의 → 승인" 이 기록될 수 있는 자리는 판정 행 자신뿐이다. §10.1 조건 5
--   ("범위는 관련성 자동 승인 하나뿐")와도 맞는다.
--
-- 🟢 비파괴. nullable 컬럼 5개 ADD COLUMN IF NOT EXISTS 뿐 — 기존 행·제약·인덱스를 건드리지 않고 백필도 없다.
--    롤백 파일 있음(`_rollback.sql` — DROP COLUMN 5줄, 이 컬럼들에만 있는 값이 사라진다: 2차 판정은 파일에서 다시
--    import 하면 복원되고, auto_approved_at 은 다음 실행이 다시 찍는다).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--
-- 컬럼
--   · second_verdict / second_model / second_judged_at — 2차 판정. 지금까지는 ops/state/relevance-second-opinion-*.json 파일에만
--     있었고 import --apply 는 라벨 4개만 채웠다(scripts/relevance-second-opinion-import.mjs:50). 이제 --record-second 가 여기 쓴다.
--     **기준 버전(criteria_version)이 현재 값인 파일만** 기록한다 — 옛 기준 판정이 자동 승인 입력이 되지 않게.
--   · auto_approved_at / auto_approval_rule — 기계가 찍은 자동 승인. 사람 결정은 여전히 human_verdict 다(있으면 이긴다).
--     rule 은 조건 버전 태그('rr-v1' = 1차·2차 둘 다 relevant). 단계적 확대(설계 §6)로 규칙이 바뀌면 옛 승인을 구분한다.
--   · audit 표시 컬럼은 두지 않는다 — 감사 결과는 기존 human_verdict · human_graded_at 이고, "자동 승인된 행에 사람 채점이
--     있다" 가 곧 감사 1건이다(새 테이블·새 UI 없음).
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 사람 또는 대화형/역할 세션이 적용한다.
--   적용해도 자동 승인은 켜지지 않는다 — 리포 변수 AUTO_APPROVAL_ENABLED=true 가 따로 필요하다(기본 꺼짐).
--   절차: 1) solutionarchive qmgrfqjfxqhxuufrnkwf 확인 2) information_schema 로 컬럼 부재 확인 3) 실행 → 하단 확인 쿼리
--         4) docs/migration-exceptions.md 한 줄.

ALTER TABLE public.review_relevance_verdicts
  ADD COLUMN IF NOT EXISTS second_verdict text
    CHECK (second_verdict IS NULL OR second_verdict IN ('relevant','irrelevant','unknown')),
  ADD COLUMN IF NOT EXISTS second_model text,
  ADD COLUMN IF NOT EXISTS second_judged_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_rule text;

-- 감사 창 조회(자동 승인 ∧ 사람 채점)와 오늘 승인 수 집계용. 대부분 NULL 이라 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_review_relevance_verdicts_auto_approved
  ON public.review_relevance_verdicts (auto_approved_at DESC)
  WHERE auto_approved_at IS NOT NULL;

COMMENT ON COLUMN public.review_relevance_verdicts.second_verdict IS
  'T2 2차 판정(독립 판정자, 현재 기준 버전만 기록). 1차 verdict 와 같은 3상태. unknown 은 무관이 아니다.';
COMMENT ON COLUMN public.review_relevance_verdicts.auto_approved_at IS
  '1차·2차 완전 동의(둘 다 relevant) 자동 승인 시각. 기계 표시다 — 사람 결정은 human_verdict 이고 있으면 이긴다.';
COMMENT ON COLUMN public.review_relevance_verdicts.auto_approval_rule IS
  '자동 승인 조건 버전 태그(rr-v1 = 완전 동의). 조건을 완화하면 새 태그로 구분한다.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='review_relevance_verdicts'
--      and column_name in ('second_verdict','second_model','second_judged_at','auto_approved_at','auto_approval_rule');  -- 5행, 전부 YES
--   select count(*) from public.review_relevance_verdicts where auto_approved_at is not null;                            -- 0 (플래그 꺼짐)
-- ── 음성 (롤백되는 형태) ──
--   begin;
--     update public.review_relevance_verdicts set second_verdict='maybe'
--      where input_id = (select input_id from public.review_relevance_verdicts limit 1);   -- 기대: ERROR 23514
--   rollback;
