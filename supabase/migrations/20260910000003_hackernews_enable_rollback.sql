-- 롤백: hackernews 소스를 다시 비활성으로.
-- 20260910000001_hackernews_source.sql 이 처음 등록한 상태(enabled=false + 사유)로 되돌린다.

UPDATE public.review_sources
   SET enabled         = false,
       disabled_reason = 'evidence_grade=B(금지 문구 미발견, 명시적 허용 확인 아님) — 사람이 검토 후 활성화',
       disabled_at     = now(),
       health_detail   = NULL
 WHERE key = 'hackernews';
