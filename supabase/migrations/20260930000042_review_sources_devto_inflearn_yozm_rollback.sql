-- 20260930000042_review_sources_devto_inflearn_yozm — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트·무인 루프는 실행하지 않는다.
-- 정방향은 소스 3행 INSERT 뿐이다. 한 번이라도 수집했다면 DELETE 대신 kill-switch(UPDATE)만 쓴다 —
-- 자식 행을 지우는 것은 데이터 삭제라 사람 판단이다(§10.2). 타깃은 000043 롤백이 먼저 지운다.

-- 1) 자식 행 확인 (fingerprints·inputs 가 0 이어야 DELETE 가능):
--   select s.key,
--          (select count(*) from public.review_targets      t where t.source_key = s.key) as targets,
--          (select count(*) from public.review_fingerprints f where f.source_key = s.key) as fingerprints,
--          (select count(*) from public.analysis_inputs     i where i.source_key = s.key) as inputs
--     from public.review_sources s where s.key in ('devto', 'inflearn', 'yozm');

-- 2) kill-switch — 항상 안전하다.
UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: 2026-09-30 강행 소스 철회', disabled_at = now()
 WHERE key IN ('devto', 'inflearn', 'yozm');

-- 3) 수집 0건(fingerprints·inputs 0)·타깃 0건을 확인했을 때만:
--   DELETE FROM public.review_sources WHERE key IN ('devto', 'inflearn', 'yozm');
