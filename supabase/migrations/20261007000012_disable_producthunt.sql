-- ============================================================
-- 20261007000012_disable_producthunt
--
-- review_sources.key='producthunt' 를 비활성으로 되돌린다 — 남헌 v30 §8.
-- 근거: 약관(상업적 이용 금지)상 수집 중단.
--   - Product Hunt API 문서 "must not be used for commercial purposes" — 000025 헤더
--     (20260930000025_review_sources_producthunt.sql:7,22)가 인용. 이 문장이 약관 prohibited 판정(SP-008,
--     docs/strategy-principles.md:26 "상업적 이용 기본 금지, 비즈니스 문의 시 예외 가능")의 출처이고,
--     20261005000004 가 tos_status='prohibited'·quote_policy='short_only' 로 기록했다.
--   - ops/state/source-review-queue.md · docs/review-collection-design.md 에는 Product Hunt 항목이 없다
--     (2026-10-07 grep) — 거기서는 인용 불가, 확인 불가.
--   - 상업 이용 허가(hello@producthunt.com)를 받았다는 기록은 리포에 없다(확인 불가).
--
-- 이력: 000025 가 enabled=false 로 등록 → 2026-09-28 남헌 지시로 enabled=true·disabled_reason NULL + review_targets 34행
--       (docs/migration-exceptions.md:413). 이 파일이 그 활성화를 되돌린다. 다음 수집부터 러너가 이 소스를 건너뛴다.
--
-- 패턴: todayhumor 폐기(20260930000019)·appstore(20260910000002)와 같다 — enabled=false + disabled_reason + disabled_at.
--       review_sources 의 CHECK(enabled OR disabled_reason IS NOT NULL)를 만족한다.
--       health·health_detail 은 건드리지 않는다 — 고장이 아니라 정책 중단이라 todayhumor(broken)와 다르다.
--
-- 🟢 비파괴. review_sources 1행 UPDATE. review_targets·이미 수집된 행(analysis_inputs 등)은 건드리지 않는다.
-- ⚠️ 상태: 미적용. 남헌이 적용한다(DB PR).
-- ⚠️ 적용 순서: 이 파일 하나로 독립이다(선행은 000025·20261005000004 가 이미 적용돼 있을 것 — 행이 있어야 UPDATE 가 먹는다).
--    적용 직후 아래 확인 쿼리를 돌려라. 이미 진행 중인 수집 실행은 끝까지 간다(러너는 실행 시작 때 enabled 를 읽는다) — 무중단.
-- ============================================================

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '약관(상업적 이용 금지)상 수집 중단 — PH API 문서 "must not be used for commercial purposes"(SP-008). 상업 이용 허가(hello@producthunt.com) 전까지 비활성. 남헌 v30 §8 (2026-10-07). 되돌림: 20261007000012 롤백.',
       disabled_at = COALESCE(disabled_at, now())
 WHERE key = 'producthunt';

-- ------------------------------------------------------------
-- 확인 쿼리 (적용 후 직접 돌린다 — 도구의 success 만 믿지 않는다, CLAUDE.md §7.1·§10.2)
--
-- 양성: 정확히 1행, enabled=false, 사유·시각 채워짐
--   SELECT key, enabled, left(disabled_reason, 30) AS reason, disabled_at IS NOT NULL AS has_at, health
--     FROM public.review_sources WHERE key = 'producthunt';
--   기대: producthunt · false · '약관(상업적 이용 금지)상 수집 중단 — PH API' · true · (health 는 전과 같음)
--
-- 다른 소스가 안 바뀌었는지(비활성 목록에 producthunt 가 추가됐을 뿐이어야 한다):
--   SELECT key, enabled FROM public.review_sources WHERE NOT enabled ORDER BY key;
--
-- 타깃 불변:
--   SELECT status, count(*) FROM public.review_targets WHERE source_key = 'producthunt' GROUP BY status;
--   기대: 적용 전과 같음(34행 기록 — 적용 전 값을 먼저 적어 둘 것)
--
-- 음성(롤백되는 형태 — 데이터를 남기지 않는다): 사유 없이 비활성 유지는 CHECK 가 막아야 한다.
--   BEGIN;
--   DO $$ BEGIN
--     UPDATE public.review_sources SET disabled_reason = NULL WHERE key = 'producthunt';
--     RAISE EXCEPTION 'NOT_BLOCKED: enabled=false AND disabled_reason NULL';
--   EXCEPTION WHEN check_violation THEN NULL; END $$;
--   ROLLBACK;
--   기대: 오류 없이 끝남(NOT_BLOCKED 가 뜨면 CHECK 가 없는 것). 이어서 양성 쿼리를 다시 돌려 행이 그대로인지 확인.
-- ------------------------------------------------------------
