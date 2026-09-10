-- 롤백: 20260911000001_notion_sync_log_published_body
--
-- ⚠️ 저장된 발행본 텍스트가 사라진다. Notion 쪽 페이지는 안 지워진다 —
--    DB 쪽 저장만 끊긴다. 보존하려면 먼저 백업:
--    COPY (SELECT id, published_body FROM public.notion_sync_log WHERE published_body IS NOT NULL)
--      TO '/tmp/notion_sync_log_published_body_backup.csv' CSV HEADER;

BEGIN;

ALTER TABLE public.notion_sync_log
  DROP COLUMN IF EXISTS published_body;

COMMIT;
