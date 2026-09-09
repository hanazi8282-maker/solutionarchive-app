-- 롤백: 20260909000001_notion_sync_log
--
-- ⚠️ Notion 동기화 이력(어떤 페이지를 언제 밀었고 뭐가 바뀌었는지)이 사라진다.
--    Notion 쪽 페이지 자체는 안 지워진다 — DB 쪽 추적만 끊긴다.
--    보존하려면 먼저 백업:
--    COPY (SELECT * FROM public.notion_sync_log) TO '/tmp/notion_sync_log_backup.csv' CSV HEADER;

BEGIN;

DROP INDEX IF EXISTS public.notion_sync_log_pulled_at_idx;
DROP INDEX IF EXISTS public.notion_sync_log_post_idx;
DROP TABLE IF EXISTS public.notion_sync_log;

COMMIT;
