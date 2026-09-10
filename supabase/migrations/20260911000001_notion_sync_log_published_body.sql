-- ============================================================
-- 20260911000001_notion_sync_log_published_body
--
-- "<발행본>" 마커 이후 텍스트를 저장할 자리.
--
-- ⚠️ 미적용. 남헌이 직접 적용한다:
--     supabase db query --linked -f supabase/migrations/20260911000001_notion_sync_log_published_body.sql
--   선행: 20260909000001(notion_sync_log).
--
-- 배경 — scripts/notion-pull-feedback.mjs 참조. 남헌이 Notion 페이지에서
-- 초안 아래 "<발행본>" 마커를 쓰고 그 아래 실제 발행한 최종 텍스트를
-- 붙여넣는다. 마커 이전(초안)은 기존 pulled_body/diff_status 로직 그대로 —
-- 이 컬럼은 마커 이후만 별도로 담는다. 마커가 없으면(아직 미발행) NULL.
--
-- 이번 단계는 "저장/로그"까지만 — 이 텍스트로 초안 생성 로직/프롬프트를
-- 자동으로 고치는 기능은 없다.
--
-- ★ 향후 원칙(지금 구현엔 영향 없음, 컬럼 의미만 미리 남겨둔다):
--   match-posts 가 pending_review 까지 확장되면 match-posts 가 정본이고,
--   이 마커/컬럼은 보조·교차검증 역할로 내려간다.
-- ============================================================

BEGIN;

ALTER TABLE public.notion_sync_log
  ADD COLUMN IF NOT EXISTS published_body text;

COMMENT ON COLUMN public.notion_sync_log.published_body IS
  '"<발행본>" 마커 이후 텍스트(남헌이 붙여넣은 실제 발행본). 마커 없으면 NULL. '
  '지금은 저장/로그 전용 — 초안 로직에 반영 안 함. 향후 match-posts 확장 시 '
  'match-posts 가 정본, 이 컬럼은 보조/교차검증 역할.';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 확인 쿼리 (적용 후 대시보드에서 직접 돌려볼 것) — 양성·음성 둘 다 본다(§7.1)
-- ────────────────────────────────────────────────────────────
--
-- 컬럼 존재:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notion_sync_log' AND column_name='published_body';
--
-- 기존 행은 전부 NULL (마이그레이션이 데이터를 만들어내지 않는다, 음성 확인):
--   SELECT count(*) FROM public.notion_sync_log WHERE published_body IS NOT NULL;
