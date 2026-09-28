-- 20260930000037_competitor_profile_snapshots 롤백 — 스냅샷 테이블을 지운다.
-- 사라지는 것은 경쟁사 프로필 스냅샷뿐이다(원문·속성·판정은 다른 테이블). 다시 적용하면 백필이 다시 만든다.

DROP TABLE IF EXISTS public.competitor_profile_snapshots;

-- 확인: select count(*) from information_schema.tables
--        where table_schema='public' and table_name='competitor_profile_snapshots';  -- 0
