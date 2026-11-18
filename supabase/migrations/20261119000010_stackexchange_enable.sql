-- v71cu 1-4 / S9: 스택익스체인지 켜기. ⛔ 적용하지 않는다 — 남헌이 "켜라"고 하면 이 파일 한 번 적용으로 끝난다. 끄는 짝: 20261119000011_stackexchange_disable.sql
-- 배경: 2026-10-22 남헌이 약관(AUP Content Scraping/Bot Policy: 생성형 AI·ML 플랫폼 목적 자동 수집 금지)을 이유로 반려. 11-19 "전부 켠다" 결정이 이 반려까지 뒤집는지는 아직 미결(v71cu-1 1-4: 꺼 둔 채로 둠).
BEGIN;
UPDATE public.review_sources SET enabled = true, disabled_reason = NULL, disabled_at = NULL, override = 'owner_2026-11-19', quote_policy = 'none', quote_allowed = false
 WHERE key = 'stackexchange' AND enabled = false;
COMMIT;
