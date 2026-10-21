-- 20261022000010_discovery_candidates_origin_new_release 롤백 — origin CHECK 를 ('mention') 으로 되돌린다. 멱등.
-- new_release 행이 있으면 좁힌 CHECK 를 통과하지 못한다 → 그 행을 먼저 'mention' 으로 되돌린다(삭제 없음, verdict_reason 의 '새 출시 입력' 표식은 그대로 남아 있다).

BEGIN;

UPDATE public.discovery_candidates SET origin = 'mention' WHERE origin = 'new_release';

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_origin_check
  CHECK (origin IS NULL OR origin IN ('mention'));

COMMIT;
