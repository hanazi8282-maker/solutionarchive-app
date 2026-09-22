-- analysis_projects.competitor_url 을 선택 항목으로 — 수기 입력 경로 개방
-- (남헌 2026-09-23 결정 Q4-A, reports/2026-09-23/data-velocity-plan.md §1)
--
-- 왜: 아직 제품도 경쟁사도 없는 창업가가 자기 고객 경험담을 붙여넣는 경로를
--     이 NOT NULL 한 칸이 막고 있었다. 붙여넣기(POST /api/analyze/inputs)는 이미
--     analysis_inputs 로 합류하므로, 막는 것은 프로젝트 생성 폼 하나뿐이다.
--
-- 성격: **비파괴**다. 제약을 푸는 방향(DROP NOT NULL)이라 기존 행은 하나도 바뀌지
--       않고, 새로 들어오는 NULL 만 허용된다. DROP COLUMN·DELETE·타입 축소 아님,
--       백필 없음, 인증 경계 무관 → CLAUDE.md §10.2 사람 판단 예외 5개에 걸리지 않는다.
--       (되돌릴 때만 주의: NULL 행이 생긴 뒤 롤백하면 그 행들을 먼저 처리해야 한다.
--        롤백 파일이 그 확인 쿼리를 들고 있다.)
--
-- ⚠️ 적용은 이 파일을 만든 서브에이전트가 하지 않는다(§10.2 — 서브에이전트는 판단 주체가 아니다).
--    오케스트레이터가 §10.2 절차로 적용한다. **현재 상태: 미적용.**

ALTER TABLE public.analysis_projects ALTER COLUMN competitor_url DROP NOT NULL;

COMMENT ON COLUMN public.analysis_projects.competitor_url IS
  '경쟁사·비교 대상 상품 URL. 2026-09-23 부터 **선택**(남헌 Q4-A) — 제품이 없는 사람이 경험담만 붙여넣는 경로를 열려고 NOT NULL 을 풀었다. reverse 모드는 앱 레벨에서 여전히 다나와 URL 을 요구한다(app/api/analyze/projects/route.ts). NULL 이면 extract·angle 프롬프트에 "(없음 …)" 으로 들어간다.';

-- 확인 (양성): is_nullable 이 YES 여야 한다.
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='analysis_projects' AND column_name='competitor_url';
--
-- 확인 (음성, 롤백되는 형태로 — 데이터를 남기지 않는다): NULL INSERT 가 실제로 통과하는가.
--   BEGIN;
--     INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status)
--     VALUES (NULL, '마이그레이션 확인용 — 롤백됨', 'hook', 'collecting');
--   ROLLBACK;
