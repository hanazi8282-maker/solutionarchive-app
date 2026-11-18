-- v71cu S7: discovery_candidates.origin 허용값을 넓힌다(mention·new_release → + search·chart·github). 좁히기 아님. 롤백: 20261119000009_..._rollback.sql
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates ADD CONSTRAINT discovery_candidates_origin_check CHECK (origin IS NULL OR origin = ANY (ARRAY['mention','new_release','search','chart','github']));
