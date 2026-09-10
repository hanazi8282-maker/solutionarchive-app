-- Hacker News 소스 활성화 (Stage 2 옵션 A+B 완성 상태)
-- 🟢 비파괴. review_sources 의 hackernews 행 1개만 UPDATE. 다른 소스와 무관하다.
--
-- 남헌 2026-09-10 결정 A: 옵션 C(댓글 전건 상세)의 5일 관찰 결과를 기다리지 않고,
-- 이미 main 에 있는 A(Algolia 검색) + B(스토리 score 배치, 커밋 d074efe) 상태로
-- 지금 켠다. C 관찰(chore/hn-firebase-c-tracking, workflow_dispatch)은 이 변경과
-- 무관하게 계속 진행한다 — A/B 활성화가 C 를 대체하거나 방해하지 않는다.
--
-- disabled_reason 은 null 로 지운다. review_sources 의 CHECK 제약은
-- `enabled OR disabled_reason IS NOT NULL` 이라 enabled=true 면 null 이 허용되고,
-- "지금 왜 꺼져 있나"를 설명하던 문구를 켠 상태로 남겨두면 다음에 읽는 사람이
-- 소스가 아직 비활성인 줄 오해한다. 활성화의 감사 기록은 이 마이그레이션 파일과
-- 커밋 메시지에 남는다.
--
-- ✅ 적용됨 (2026-09-10, CLAUDE.md §10.2 — 남헌 1회성 예외 승인으로 클로드코드가
--    직접 실행). 프로젝트 ref: qmgrfqjfxqhxuufrnkwf. 이후 마이그레이션은 다시
--    §10.1 기본 원칙(사람이 대시보드에서 직접 실행)으로 돌아간다.

UPDATE public.review_sources
   SET enabled         = true,
       disabled_reason = NULL,
       disabled_at     = NULL,
       health          = 'ok',
       health_detail   = '2026-09-10 남헌 승인 — A+B 완성 상태로 활성화, C(댓글 전건 상세)는 별도 관찰 중',
       health_checked_at = now()
 WHERE key = 'hackernews';

-- 확인용 (적용 후 눈으로 볼 것):
--   SELECT key, enabled, disabled_reason, health, health_detail
--     FROM public.review_sources ORDER BY key;
--
-- 기대: hackernews 행의 enabled = true, disabled_reason = NULL.
--       appstore 는 여전히 enabled = false (robots 위반, 20260910000002 건드리지 않음).
--       danawa 는 그대로 enabled = true.
