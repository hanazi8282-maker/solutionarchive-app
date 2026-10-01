-- ============================================================
-- 20261001000051_review_sources_disable_inflearn — inflearn 소스 비활성화
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
-- 근거: 남헌 결정 2026-10-01(v10) — inflearn 수집 중단. 등록 마이그 20260930000042 에서도
--   "약관 /policy/terms-of-service 는 CSR 이라 조항을 못 읽었다"(확인 불가)로 적혀 있던 소스다.
-- 🟢 비파괴. review_sources 한 행의 플래그만 바꾼다. 행·review_targets·이미 모은 VOC 는 그대로 둔다.
--   러너는 lib/review/store.ts 가 enabled 를 읽어 꺼진 소스를 건드리지 않는다.
-- 행 식별: key = 'inflearn' (20260930000042 L53 의 INSERT 값 그대로).
-- 가드: 영향 행이 정확히 1이 아니면 예외 → 트랜잭션 전체 롤백. 이미 꺼져 있어도 1행이라 다시 돌려도 안전하다.
-- ============================================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources
     SET enabled = false,
         disabled_reason = '남헌 결정 2026-10-01(v10): inflearn 수집 중단. 약관 조항 확인 불가(CSR) 소스.',
         disabled_at = now()
   WHERE key = 'inflearn';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'inflearn disable: expected exactly 1 row, got %', n;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: inflearn 만 꺼짐(enabled=false · 사유·시각 채워짐)
--   SELECT key, enabled, disabled_reason, disabled_at FROM public.review_sources WHERE key = 'inflearn';
-- 음성: 다른 소스 enabled 는 적용 전과 같다(적용 전에 한 번 세 두고 비교)
--   SELECT count(*) FILTER (WHERE enabled) AS enabled_n, count(*) AS total FROM public.review_sources WHERE key <> 'inflearn';
