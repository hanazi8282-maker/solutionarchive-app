-- ============================================================
-- 20261001000047_analysis_aspects_evidence_quotes_ko — 속성 원문 인용의 한국어 번역 칸
--
-- ⛔ 미적용. 서브에이전트가 파일만 만들었다 — 적용은 오케스트레이터(§10.2 자체 판단: nullable 컬럼 1개 추가 ·
--    비파괴 · 기존 행 NULL · 롤백 파일 있음 · 사람 판단 예외 5개에 걸리지 않는다). 적용 후 `docs/migration-exceptions.md` 에 한 줄.
--
-- evidence_quotes 는 **정본**이다(원문 그대로, 감사·재검증용 — lib/analysis/extract-run.ts). 건드리지 않는다.
-- evidence_quotes_ko 는 화면 표시용 번역 배열(string[]) — evidence_quotes 와 같은 길이·순서. NULL = 번역 전(실패 포함).
-- 채우는 곳: lib/analysis/quote-translate.ts(추출 직후) · scripts/aspect-quotes-ko-backfill.mjs(기존 행).
-- 코드는 이 컬럼이 없어도 뜬다(검수 GET 은 42703 이면 컬럼 없이 다시 읽는다) — 적용 순서는 자유.
-- ============================================================

BEGIN;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS evidence_quotes_ko jsonb;

COMMENT ON COLUMN public.analysis_aspects.evidence_quotes_ko IS
  'evidence_quotes 와 같은 길이·순서의 한국어 번역 배열(string[]), NULL=번역 전. 정본은 evidence_quotes(원문).';

COMMIT;

-- 확인(적용 후):
--   양성: SELECT column_name, data_type, is_nullable FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='analysis_aspects' AND column_name='evidence_quotes_ko';
--         → 1행 · jsonb · YES
--   기존 행 NULL: SELECT count(*) FILTER (WHERE evidence_quotes_ko IS NOT NULL) FROM public.analysis_aspects;  → 0
--   음성(롤백되는 형태): BEGIN; SELECT evidence_quotes_nope FROM public.analysis_aspects LIMIT 1; ROLLBACK;  → 42703
