-- 롤백: 20260930000017_reactivate_todayhumor — 차단 당시(2026-09-24 11:36 UTC) 값으로 되돌린다.
UPDATE public.review_sources
   SET enabled = false,
       health = 'broken',
       health_detail = '차단 응답 1건(403/429) — 재시도하지 않고 소스를 중단한다',
       disabled_reason = '차단 응답 1건(403/429) — 재시도하지 않고 소스를 중단한다',
       disabled_at = '2026-09-24T11:36:24.892+00:00'
 WHERE key = 'todayhumor';
