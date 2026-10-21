-- 20261022000030_mention_ledger_20261021.sql 롤백 — 언급 대장 2026-10-21 이 넣거나 갱신한 언급 행을 기각으로 접는다. 삭제 없음. 멱등.
BEGIN;
UPDATE public.discovery_candidates SET verdict = 'rejected', verdict_reason = 'v71ba 롤백(mention_ledger 2026-10-21)'
 WHERE origin = 'mention' AND verdict <> 'accepted' AND last_seen_at = '2026-10-21T00:00:00+09:00'
   AND mention_count IS NOT NULL
   AND lower(name) IN ('adp', 'production', 'raindrop', 'pocket', 'bitwarden', 'erpnext', 'table', 's3', 'render', 'screen studio', 'barawave', '전동칫솔', 'openai', 'data');
COMMIT;
