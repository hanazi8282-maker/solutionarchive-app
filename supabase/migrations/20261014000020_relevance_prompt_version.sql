-- T2 판정 행마다 프롬프트(기준) 버전을 남긴다 — 전량 판정(원문 약 67,355건)을 여러 날에 걸쳐 채우는 동안 기준 문구가 바뀌면
-- 어느 행이 어느 기준으로 판정됐는지 가를 수 있어야 한다. 모델명은 이미 model(NOT NULL) 컬럼에 기록된다.
--
-- 🟢 비파괴. nullable text 1개 ADD COLUMN IF NOT EXISTS 뿐 — 백필·CHECK·인덱스 없음. 기존 행은 전부 NULL(= 기록 시작 전 판정).
--    롤백 파일 있음(`_rollback.sql` — DROP COLUMN 1줄). 사라지는 값: 이 컬럼의 기록뿐, 판정(verdict)·사람 채점은 그대로.
--    CLAUDE.md §10.2 사람 판단 예외 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--    코드(scripts/relevance-judge-auto.mjs)는 이 컬럼이 없으면(PGRST204·42703) prompt_version 만 빼고 저장한다 — 적용 전에도 판정은 돈다.
--
-- 값: lib/analysis/relevance-criteria.ts RELEVANCE_CRITERIA_VERSION (예: 't2d-2026-09-28').
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 대화형·역할 세션이 §10.2 절차로 적용한다.

ALTER TABLE public.review_relevance_verdicts
  ADD COLUMN IF NOT EXISTS prompt_version text;

COMMENT ON COLUMN public.review_relevance_verdicts.prompt_version IS
  '1차 판정 기준 버전(lib/analysis/relevance-criteria.ts RELEVANCE_CRITERIA_VERSION). null = 기록 시작(20261014000020) 전 판정.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='review_relevance_verdicts' and column_name='prompt_version';  -- 1행, text, YES
--   select count(*) from public.review_relevance_verdicts where prompt_version is not null;                   -- 0 (백필 없음)
-- ── 음성 ──
--   제약이 없는 nullable text 라 막히는 값이 없다. 대신 롤백 파일을 트랜잭션 안에서 돌려 되돌림이 되는지 본다:
--   begin; \i 20261014000020_relevance_prompt_version_rollback.sql
--     select count(*) from information_schema.columns where table_name='review_relevance_verdicts' and column_name='prompt_version';  -- 0
--   rollback;
