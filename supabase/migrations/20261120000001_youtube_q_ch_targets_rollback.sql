-- 롤백(v71cu S8-2): q:·ch: 타깃만 지운다(이 배치가 만든 행, 아직 수집 합계 0인 것). 만들어진 v: 타깃·프로젝트는 건드리지 않는다.
BEGIN;
DELETE FROM public.review_targets WHERE onboard_batch = 'yt_q_ch_20261120' AND layer IN ('yt_query', 'yt_channel') AND total_collected = 0;
COMMIT;
