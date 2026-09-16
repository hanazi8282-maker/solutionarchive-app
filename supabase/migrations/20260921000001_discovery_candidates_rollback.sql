-- 20260921000001_discovery_candidates.sql 되돌리기
--
-- ⚠️ 파괴적이다. 발굴 이력이 전부 사라진다 — 그러면 이미 기각한 후보를
--    다시 제안하기 시작한다. 이 테이블이 참조하는 쪽(analysis_projects /
--    review_targets)은 **안 지운다.** 발굴이 만든 프로젝트는 그대로 남는다.
--    그것까지 지우려면 사람이 별도로 판단해서 지운다(여기 넣지 않는다 —
--    롤백 한 번에 분석 결과까지 날아가면 되돌릴 수 없다).
--
-- 인덱스는 테이블과 함께 사라진다.

DROP TABLE IF EXISTS public.discovery_candidates;
