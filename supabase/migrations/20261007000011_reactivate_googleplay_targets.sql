-- ============================================================
-- Google Play 타깃 1회성 재활성화 — exhausted → active (v27)
--
-- 🟠 **남헌 적용(사람 판단 예외 2번 — 대량 UPDATE).** 서브에이전트가 파일만 만들었다. 미적용.
--
-- 왜: googleplay 어댑터가 다음 페이지 토큰을 엉뚱한 칸(at(inner,-2,-1))에서 읽어 늘 null 을 냈다.
--     러너는 그걸 "끝까지 읽음"으로 받아 첫 실행 1페이지(40건) 뒤 타깃을 exhausted 로 닫았다.
--     listDueTargets 는 active 만 보므로 그 타깃은 영영 다시 안 돈다. 같은 PR 의 코드가
--     토큰 경로를 고치고 incrementalOnly 를 켜서 앞으로는 닫히지 않는다 — 이 파일은 이미 닫힌 것을 연다.
-- ⚠️ 코드 PR 이 먼저 머지된 뒤 돌린다. 코드 없이 이 파일만 돌리면 다음 실행에서 또 1페이지 뒤 닫힌다.
--
-- 🟢 비파괴. review_targets 의 status·consecutive_empty 두 컬럼만 바꾼다. cursor·last_review_at·
--    total_collected 는 그대로 — last_review_at 이 증분 기준선이라 이미 본 리뷰는 다시 적재하지 않는다.
-- 🔁 가역: 바꾼 행과 원래 값을 스냅샷 테이블에 먼저 적는다. 롤백은 그 행만 되돌린다.
--    롤백: 20261007000011_reactivate_googleplay_targets_rollback.sql
--
-- ── 적용 전 대상 확인 ─────────────────────────────────────────
--   SELECT count(*) AS n, min(last_run_at), max(last_run_at)
--     FROM public.review_targets WHERE source_key='googleplay' AND status='exhausted';
--   -- 기대: 약 20(지난 라운드 실측). 크게 다르면 멈추고 이유를 본다(§7.1).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_targets_reactivated_20261007 (
  target_id              uuid PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE,
  prev_status            text    NOT NULL,
  prev_consecutive_empty integer NOT NULL,
  reactivated_at         timestamptz NOT NULL DEFAULT now()
);

-- 앱은 service_role 로만 읽는다(CLAUDE.md §5-1). 정책 0개 = anon 직접 접근 불가.
ALTER TABLE public.review_targets_reactivated_20261007 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_targets_reactivated_20261007 IS
  '20261007000011 googleplay 재활성화가 바꾼 타깃과 원래 값. 롤백이 읽는다. 롤백 후 지워도 된다.';

INSERT INTO public.review_targets_reactivated_20261007 (target_id, prev_status, prev_consecutive_empty)
SELECT id, status, consecutive_empty
  FROM public.review_targets
 WHERE source_key = 'googleplay'
   AND status = 'exhausted'
ON CONFLICT (target_id) DO NOTHING;

UPDATE public.review_targets t
   SET status = 'active',
       consecutive_empty = 0
  FROM public.review_targets_reactivated_20261007 s
 WHERE t.id = s.target_id
   AND t.status = 'exhausted';

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 스냅샷 건수 = 되살아난 건수(≈20)
-- SELECT (SELECT count(*) FROM public.review_targets_reactivated_20261007) AS snapshot,
--        (SELECT count(*) FROM public.review_targets t
--           JOIN public.review_targets_reactivated_20261007 s ON s.target_id = t.id
--          WHERE t.status = 'active') AS now_active;
-- 양성: googleplay 에 exhausted 가 남지 않는다
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='exhausted';  -- 기대 0
-- 음성: 다른 소스의 exhausted 수는 적용 전과 같다(범위를 넘지 않았다)
-- SELECT source_key, count(*) FROM public.review_targets WHERE status='exhausted' GROUP BY 1 ORDER BY 1;
