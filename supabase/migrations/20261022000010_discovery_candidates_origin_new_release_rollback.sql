-- 20261022000010_discovery_candidates_origin_new_release 롤백 — origin CHECK 를 ('mention') 으로 되돌린다. 멱등.
-- new_release 행이 있으면 좁힌 CHECK 를 통과하지 못한다 → 그 행을 먼저 'mention' 으로 되돌린다(삭제 없음).
-- ⚠️ 소급 마이그(new-release-backfill.mjs 가 만든 …_new_release_backfill_v71ba.sql)를 적용했다면 그 롤백을 **먼저** 돌린다 —
--    소급이 채운 mention_count 가 남은 채 mention 으로 돌아가면 상태판이 그 행을 리뷰 속 언급으로 센다.

BEGIN;

UPDATE public.discovery_candidates SET origin = 'mention' WHERE origin = 'new_release';

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_origin_check
  CHECK (origin IS NULL OR origin IN ('mention'));

COMMIT;
