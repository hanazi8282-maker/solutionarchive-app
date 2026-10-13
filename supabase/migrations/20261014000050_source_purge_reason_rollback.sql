-- 20261014000050_source_purge_reason 롤백 — purge_reason CHECK 를 ('retention','dedupe') 로 되돌린다. source_purge 행이 있으면 실패한다(데이터를 바꾸지 않는다).
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.analysis_inputs WHERE purge_reason = 'source_purge') THEN
    RAISE EXCEPTION 'source_purge 행이 있어 CHECK 를 되돌릴 수 없다 — 먼저 사람이 판단한다';
  END IF;
END $$;

ALTER TABLE public.analysis_inputs DROP CONSTRAINT analysis_inputs_purge_reason_check;
ALTER TABLE public.analysis_inputs ADD CONSTRAINT analysis_inputs_purge_reason_check
  CHECK (purge_reason IS NULL OR purge_reason = ANY (ARRAY['retention'::text, 'dedupe'::text]));

COMMIT;
