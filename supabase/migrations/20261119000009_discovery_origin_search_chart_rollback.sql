-- 롤백: search·chart·github 행이 없을 때만 성공한다(있으면 먼저 그 행의 origin 을 사람이 정리).
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates ADD CONSTRAINT discovery_candidates_origin_check CHECK (origin IS NULL OR origin = ANY (ARRAY['mention','new_release']));
