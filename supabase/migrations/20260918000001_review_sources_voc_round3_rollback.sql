-- 롤백: VOC 라운드3 3소스 kill-switch (bobaedream · tumblbug · naver_blog_post)
-- ⛔ Claude 가 실행하지 않는다. 사람이 supabase db query --linked -f 로 적용한다.
--
-- 행을 지우지 않고 끄기만 한다. review_sources.enabled=false 면 러너가 그 소스를
-- 통째로 건너뛴다. 이미 모은 리뷰는 그대로 두고 수집만 멈추는 것이 되돌리기 쉽다.
--
-- 정방향 마이그레이션이 이미 enabled=false 로 넣으므로, 이 파일이 실제로 쓰이는
-- 경우는 사람이 한 번 켠 뒤 되돌릴 때다.

-- ⚠️ naver_blog_post 는 약관 리스크를 인지하고 켠 소스다(SP-030). 문제가 보이면
--    여기부터 돌린다 — 이 UPDATE 한 줄이 그 소스의 킬스위치다.

UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: VOC 라운드3(bobaedream·tumblbug·naver_blog_post) 철회'
 WHERE key IN ('bobaedream', 'tumblbug', 'naver_blog_post');

-- ── 행 자체를 지우려면 ────────────────────────────────────────────
-- FK 자식 행이 없어야 한다. **먼저 세어 보고**, 전부 0 일 때만 DELETE 한다.
-- 0 이 아니면 그건 이미 수집한 데이터다 — 지울지 말지는 사람이 판단한다.
--
--   select 'review_targets'      as t, source_key, count(*) from public.review_targets
--    where source_key in ('bobaedream','tumblbug','naver_blog_post') group by 2
--   union all
--   select 'review_fingerprints', source_key, count(*) from public.review_fingerprints
--    where source_key in ('bobaedream','tumblbug','naver_blog_post') group by 2
--   union all
--   select 'analysis_inputs',     source_key, count(*) from public.analysis_inputs
--    where source_key in ('bobaedream','tumblbug','naver_blog_post') group by 2;
--
--   -- 해당 소스의 세 건수가 전부 0 일 때만:
--   -- delete from public.review_sources where key = '<그 소스>';
--
-- product_ref 컬럼 주석은 되돌리지 않는다 — 주석은 동작에 영향이 없고,
-- 되돌리면 이번에 추가한 /view 한정 가드 설명까지 함께 사라진다.
