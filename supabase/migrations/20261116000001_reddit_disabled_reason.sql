-- v71cp §1: reddit 은 법적 리스크로 켜지 않는다(남헌 2026-11-16). enabled=false 유지, 사유 문구만 정정.
-- 추가 전용 의미: 한 행의 disabled_reason 한 칸만 바꾼다. enabled·override·robots_status 는 건드리지 않는다.
UPDATE public.review_sources
   SET disabled_reason = '남헌 2026-11-16: 법적 리스크로 켜지 않음',
       disabled_at = COALESCE(disabled_at, now())
 WHERE key = 'reddit' AND enabled = false;
-- 확인: SELECT enabled, disabled_reason FROM public.review_sources WHERE key='reddit';  -- 기대 false / 위 문구
