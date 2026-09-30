-- ============================================================
-- 20261001000047_analysis_aspects_evidence_quotes_ko — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ DROP COLUMN 이다 — 번역이 채워진 뒤라면 §10.2 사람 판단 예외(되돌리기 어려운 삭제)다. 먼저 센다:
--      SELECT count(*) FILTER (WHERE evidence_quotes_ko IS NOT NULL) FROM public.analysis_aspects;
--    번역은 원문(evidence_quotes)에서 다시 만들 수 있지만 claude-cli 호출이 다시 든다.
-- 코드 쪽 되돌리기: 이 PR revert. 컬럼이 먼저 사라져도 검수 GET 은 컬럼 없이 다시 읽어 원문만 보여 준다.
-- ============================================================

BEGIN;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS evidence_quotes_ko;
COMMIT;
