-- 20261120000001_discovery_v2_log 롤백. 기록 표 2개는 비어 있거나 로그뿐이다(삭제 대상이 운영 데이터 아님). 채택 조건은 옛 조건으로 되돌린다
-- — 되돌리기 전 확인: 새 조건으로만 통과한 accepted 언급 행이 있으면 ADD CONSTRAINT 가 실패한다(그 행의 area_code/area_fit 을 먼저 확인).
BEGIN;
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_mention_accept_check;
ALTER TABLE public.discovery_candidates ADD CONSTRAINT discovery_candidates_mention_accept_check CHECK (
  origin IS DISTINCT FROM 'mention' OR verdict <> 'accepted'
  OR (post_count >= 3 AND cardinality(evidence_input_ids) >= 3 AND area_fit >= 0.9 AND area_code IN ('1','2','3','4','5')));
DROP VIEW IF EXISTS public.v_discovery_link_daily;
DROP TABLE IF EXISTS public.source_probe_log;
DROP TABLE IF EXISTS public.discovery_run_log;
COMMIT;
