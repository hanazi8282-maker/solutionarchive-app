-- analysis_angles 에 "각색 제안" 필드 추가 (순수 ADD COLUMN, 비파괴)
--
-- 배경(§17-2 갭 #2): reverse 모드(§13-1)에서 역산한 경쟁사 성공 앵글을,
-- 우리 상품에 맞게 어떻게 각색할지에 대한 제안을 저장할 자리가 없었다.
-- 갭 #1("review_targets 생성 API 라우트 부재")은 이미 있는 기존 동작이라
-- 갭이 아님이 확인됐고(app/api/analyze/targets/route.ts 헤더 참고), 실제
-- 남은 갭은 이것뿐이다.
--
-- nullable, 기존 행에 영향 없음. forward 모드 프로젝트의 앵글에서는 보통 null —
-- 역산 대상 자체가 없으므로 각색 제안도 무의미하다.
--
-- ⚠️ 미적용 (CLAUDE.md §10.1). 남헌이 대시보드에서 직접 실행. 프로젝트 ref: qmgrfqjfxqhxuufrnkwf

ALTER TABLE public.analysis_angles
  ADD COLUMN IF NOT EXISTS adaptation_suggestion text;

COMMENT ON COLUMN public.analysis_angles.adaptation_suggestion IS
  'reverse 모드에서 역산된 경쟁사 성공 앵글을, 우리 상품에 맞게 어떻게 각색할지에 '
  '대한 제안. forward 모드에서는 역산 대상이 없으므로 보통 null.';

-- 확인용 (적용 후):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name='analysis_angles' AND column_name='adaptation_suggestion';
--   기대: adaptation_suggestion | text | YES
--
--   -- 기존 행 영향 없음 확인
--   SELECT count(*) FROM public.analysis_angles WHERE adaptation_suggestion IS NOT NULL;
--   기대: 0 (마이그레이션 직후, 신규 생성분 없을 때)
