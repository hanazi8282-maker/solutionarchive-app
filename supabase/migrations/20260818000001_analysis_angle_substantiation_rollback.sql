-- ============================================================
-- 롤백: 20260818000001_analysis_angle_substantiation.sql
-- 판정 근거 컬럼 4종 제거.
--
-- ⚠️ 주의: 이 컬럼들에 쌓인 judge 판정 사유·근거 인용·재작성 전 원문은
--    복구 불가로 사라진다. 앵글 자체(headline_draft, substantiation_verdict)는
--    남지만 "왜 그렇게 판정했는가"의 감사 기록은 소실된다.
--    필요하면 실행 전에 아래로 보존할 것.
--      CREATE TABLE public._archive_angle_substantiation_20260818 AS
--        SELECT id, project_id, substantiation_reason, substantiation_evidence,
--               headline_original, gate_rewritten
--          FROM public.analysis_angles;
--
-- ⚠️ 배포 순서: 코드를 **먼저** 되돌린 뒤 이 롤백을 적용한다.
--    신규 컬럼에 INSERT 하는 코드가 살아있는 상태에서 컬럼을 지우면
--    앵글 저장이 전부 실패한다.
--
-- 다른 테이블/컬럼/제약/인덱스는 건드리지 않는다.
-- ============================================================

ALTER TABLE public.analysis_angles DROP COLUMN IF EXISTS gate_rewritten;
ALTER TABLE public.analysis_angles DROP COLUMN IF EXISTS headline_original;
ALTER TABLE public.analysis_angles DROP COLUMN IF EXISTS substantiation_evidence;
ALTER TABLE public.analysis_angles DROP COLUMN IF EXISTS substantiation_reason;
