-- 롤백: okky · velog 소스 kill-switch
-- ⛔ Claude 가 실행하지 않는다. 사람이 supabase db query --linked -f 로 적용한다.
--
-- 행을 지우지 않고 끄기만 한다. review_sources.enabled=false 면 러너가 그 소스를
-- 통째로 건너뛴다. 이미 모은 리뷰는 그대로 두고 수집만 멈추는 것이 되돌리기 쉽다.
--
-- 정방향 마이그레이션이 이미 enabled=false 로 넣으므로, 이 파일이 실제로 쓰이는
-- 경우는 사람이 한 번 켠 뒤 되돌릴 때다.

UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: VOC 소스 round-5 채택분(okky·velog) 철회'
 WHERE key IN ('okky', 'velog');

-- 행 자체를 지우려면 review_targets / review_fingerprints / analysis_inputs 의
-- source_key IN ('okky','velog') 행을 먼저 정리해야 한다(FK).
-- 그건 데이터 삭제라 사람이 판단한다.
--
-- product_ref 컬럼 주석은 되돌리지 않는다 — 주석은 동작에 영향이 없고,
-- 되돌리면 SSRF 경고와 SP-026·027·028 경고까지 함께 사라진다.
