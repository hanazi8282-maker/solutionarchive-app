-- 롤백: hackernews 소스 kill-switch
-- ⛔ Claude 가 실행하지 않는다. 사람이 supabase db query --linked -f 로 적용한다.
--
-- 행을 지우지 않고 끄기만 한다. review_sources.enabled=false 면 러너가
-- 그 소스를 통째로 건너뛴다(runner.ts — '소스가 비활성 상태다'). 이미 모은
-- 리뷰는 그대로 두고 수집만 멈추는 것이 되돌리기 쉬운 쪽이다.

UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: hackernews 어댑터 철회'
 WHERE key = 'hackernews';

-- 행 자체를 지우려면 review_targets/review_fingerprints/analysis_inputs 의
-- source_key='hackernews' 행을 먼저 정리해야 한다(FK). 그건 데이터 삭제라 사람이 판단한다.
