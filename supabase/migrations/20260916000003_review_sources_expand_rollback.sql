-- 롤백 — 20260916000003_review_sources_expand.sql
--
-- ⚠️ **참조 행이 있으면 FK 가 이 DELETE 를 막는다. 그게 정상 동작이다.**
--    `review_targets.source_key` 와 `analysis_inputs.source_key` 가
--    `review_sources(key)` 를 참조한다. 이미 그 소스로 타깃을 만들었거나
--    리뷰를 적재했다면 23503 으로 실패한다.
--
--    그때 CASCADE 로 밀지 마라. 수집 이력을 조용히 날리는 것이고, 되돌릴 수
--    없다. 소스를 멈추고 싶은 것이라면 삭제가 아니라 **비활성화**가 맞다:
--
--      update public.review_sources
--         set enabled = false,
--             disabled_reason = '<왜 껐는지 한 줄>',
--             disabled_at = now()
--       where key in ('naver_blog','naver_cafe','naver_kin','youtube','reddit');
--
--    정말로 행을 지워야 한다면 참조부터 사람이 확인하고 지운다:
--      select source_key, count(*) from public.analysis_inputs
--       where source_key in ('naver_blog','naver_cafe','naver_kin','youtube','reddit')
--       group by source_key;
--
-- product_ref 주석은 이전 문구(danawa/appstore/hackernews 3종)로 되돌린다.

DELETE FROM public.review_sources
 WHERE key IN ('naver_blog', 'naver_cafe', 'naver_kin', 'youtube', 'reddit');

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다.';
