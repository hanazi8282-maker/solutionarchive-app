-- ============================================================
-- 20260930000019_retire_todayhumor
--
-- todayhumor 소스 폐기(dead) 확정 — 남헌 2026-09-25.
--   2026-09-24 첫 차단(403) → 2026-09-25 000017 로 재활성화 → 직후 수동 수집(run 36136401877)에서 첫 요청부터 403 → 러너 자동 재차단.
--   IP 레벨 차단으로 판단. 우회(IP 로테이션·UA 스푸핑)는 원칙 위반이라 하지 않는다(scripts/review-source-probe.mjs 규칙 2·3).
--
-- 패턴: 네이버 계열(naver_blog·naver_blog_post·naver_cafe·naver_kin)과 같다 — enabled=false + disabled_reason 에 사유 명시.
--       별도 상태값 컬럼은 없다. "폐기(dead)" 를 disabled_reason 첫머리에 적어 그 행이 일시 차단이 아니라 폐기임을 가른다.
-- 🟢 비파괴. 1행 UPDATE. 되살리려면 000017 을 다시 적용한다(그때는 같은 결과가 날 것을 안다).
-- ============================================================

UPDATE public.review_sources
   SET enabled = false,
       health = 'broken',
       health_detail = '폐기(dead) — IP 레벨 차단(403). 2026-09-25 재활성화 직후 첫 요청부터 재차단. 우회 정책상 불가(IP/UA 스푸핑 금지 원칙).',
       health_checked_at = now(),
       disabled_reason = '폐기(dead) — IP 레벨 차단(403), 우회 정책상 불가(IP/UA 스푸핑 금지 원칙 위반). 남헌 2026-09-25 확정. 재활성화 시도 이력: 000017(2026-09-25) → run 36136401877 즉시 403.',
       disabled_at = COALESCE(disabled_at, now())
 WHERE key = 'todayhumor';

-- 확인 쿼리
--   SELECT key, enabled, health, left(disabled_reason, 20) FROM public.review_sources WHERE key = 'todayhumor';
--   기대: false · broken · '폐기(dead) — IP 레벨'
