-- analysis_projects 에 forward/reverse 모드 컬럼 추가 (순수 ADD COLUMN, 비파괴)
--
-- 남헌 2026-09-10 결정 B — 역방향 모드(§13-1): 경쟁사의 이미 성공한 상품 URL 을
-- 입력하면 "이 상품이 어떤 소구점으로 성공했는지"를 역산한다. 기존 파이프라인
-- (수집→추출→기회점수→앵글)을 재파라미터화 없이 그대로 재사용하고, 진입점만
-- 하나 추가한다 — 그래서 신규 테이블이 아니라 이 컬럼 하나다.
--
-- 기본값 'forward' 라 기존 행·기존 코드 경로는 그대로다.
--
-- ✅ 적용됨 (2026-09-10, CLAUDE.md §10.2 — 남헌 1회성 예외 승인으로 클로드코드가
--    직접 실행). 프로젝트 ref: qmgrfqjfxqhxuufrnkwf. 이후 마이그레이션은 다시
--    §10.1 기본 원칙(사람이 대시보드에서 직접 실행)으로 돌아간다.

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'forward'
    CHECK (mode IN ('forward', 'reverse'));

COMMENT ON COLUMN public.analysis_projects.mode IS
  'forward=자사 상품 소구점 발굴(기본). reverse=경쟁사 성공 상품 URL 역설계(§13-1). '
  'reverse 는 2026-09-10 MVP 기준 다나와가 커버하는 실물 상품만 — 스마트스토어/쿠팡은 '
  '트랙 B 미커버, SaaS(G2/Capterra)는 이용약관상 접근 금지(SP-007).';

-- 확인용 (적용 후):
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name='analysis_projects' AND column_name='mode';
--   기대: mode | text | 'forward'::text
--
--   -- 음성: 어휘 밖 값은 거절돼야 한다
--   INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, mode)
--     VALUES ('x', 'x', 'hook', 'sideways');
--   기대: ERROR 23514 check constraint "analysis_projects_mode_check"
