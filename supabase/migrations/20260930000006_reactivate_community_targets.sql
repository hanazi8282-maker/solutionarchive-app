-- ============================================================
-- 커뮤니티 타깃 1회성 재활성화 — exhausted → active
--
-- 🟠 **사람 적용.** 세션이 자체 판단으로 돌리지 않는다.
--    CLAUDE.md §10.2 "프로덕션 데이터 손상 위험 — 백필·대량 UPDATE" 예외에 해당한다
--    (약 82행 UPDATE). 비파괴이고 롤백이 정확하지만, 그것과 별개로 사람이 누른다.
--
-- 남헌 2026-09-23 Q3(a) 결정의 DB 절반이다. 코드 절반은 같은 PR 의
-- lib/review/adapters/*.ts 11개에 붙은 `incrementalOnly: true` 다.
-- ⚠️ 둘 중 하나만 적용하면 효과가 어긋난다:
--     · 코드만 적용(이 파일을 안 돌린 상태) — 앞으로는 닫히지 않지만 이미 닫힌 82건은 잠겨 있다.
--     · 이 파일만 적용 — 되살아나지만 그날 실행에서 다시 `exhausted` 로 닫힌다.
--    코드가 먼저 머지되므로, 이 파일은 언제 돌려도 순서 문제가 없다.
--
-- 왜 필요한가 (reports/2026-09-23/voc-expansion-investigation.md §3):
--   · review_targets 113건 중 85건(75%)이 `exhausted`.
--   · 그중 80건은 `consecutive_empty = 0` — "성과가 없어서"가 아니라 "끝까지 읽어서" 닫혔다.
--   · lib/review/store.ts listDueTargets 는 `status='active'` 만 집는다. exhausted 를
--     되돌리는 코드는 리포 어디에도 없다 → 그 타깃은 영영 다시 안 돈다.
--
-- 🟢 비파괴. review_targets 의 status 1개 컬럼만 바꾼다. cursor·total_collected·
--    last_review_at 은 건드리지 않는다 — 증분 기준선(last_review_at)이 살아 있어야
--    이미 본 댓글을 다시 적재하지 않는다.
--    danawa(pcode) · appstore(앱 id) · youtube 는 **제외**한다. 그건 대상이 고정된 문서라
--    진짜로 끝이 있고, 되살리면 같은 것을 매일 다시 훑는다.
--
-- 🔁 가역성: 바꾼 행의 id 를 스냅샷 테이블에 먼저 적어 둔다. 그래서 롤백이
--    "11개 소스의 active 전부"가 아니라 **이 실행이 바꾼 그 행들만** 되돌린다.
--    스냅샷이 없으면 그 사이 새로 등록된 정상 active 타깃까지 같이 닫힌다.
--    롤백: 20260930000006_reactivate_community_targets_rollback.sql
--
-- ── 적용 전에 먼저 돌려 볼 것 (대상 건수 확인) ──────────────────
--
--   SELECT source_key, count(*) AS n, min(last_run_at) AS oldest, max(last_run_at) AS newest
--     FROM public.review_targets
--    WHERE status = 'exhausted'
--      AND source_key IN ('82cook','bobaedream','brunch','clien','damoang','fmkorea',
--                         'okky','theqoo','todayhumor','tumblbug','velog')
--    GROUP BY source_key
--    ORDER BY n DESC;
--
--   -- 2026-09-23 16:13 KST 실측(전건 조회) 기대값: 합계 82건
--   --   clien 19 · 82cook 7 · brunch 7 · fmkorea 5 · theqoo 4 · bobaedream 3 ·
--   --   damoang 3 · todayhumor 3 · tumblbug 1 · okky 0 · velog 0
--   --   (youtube 18 · danawa 15 는 이 목록에 없다 — 의도적으로 제외했다)
--   -- ⚠️ 합계가 82 에서 크게 벗어나면 멈추고 왜 달라졌는지 본다. 그 사이 밤 수집이
--   --    더 닫았으면 늘어난다(정상). 줄었다면 누가 이미 손댔다는 뜻이다(§7.1).
-- ============================================================

BEGIN;

-- 1. 무엇을 바꾸는지 먼저 남긴다(롤백의 근거). 재실행해도 안전하다.
CREATE TABLE IF NOT EXISTS public.review_targets_reactivated_20260930 (
  target_id uuid PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE,
  prev_status text NOT NULL,
  reactivated_at timestamptz NOT NULL DEFAULT now()
);

-- 앱은 service_role 로만 DB 를 읽는다(CLAUDE.md §5-1). 정책 0개 = anon 키로 직접 못 읽는다.
ALTER TABLE public.review_targets_reactivated_20260930 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_targets_reactivated_20260930 IS
  '20260930000006 재활성화가 바꾼 타깃 목록. 롤백이 이걸 읽는다. 롤백 후에는 지워도 된다.';

INSERT INTO public.review_targets_reactivated_20260930 (target_id, prev_status)
SELECT id, status
  FROM public.review_targets
 WHERE status = 'exhausted'
   AND source_key IN ('82cook','bobaedream','brunch','clien','damoang','fmkorea',
                      'okky','theqoo','todayhumor','tumblbug','velog')
ON CONFLICT (target_id) DO NOTHING;

-- 2. 스냅샷에 적힌 것만 되살린다.
UPDATE public.review_targets t
   SET status = 'active'
  FROM public.review_targets_reactivated_20260930 s
 WHERE t.id = s.target_id
   AND t.status = 'exhausted';

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 스냅샷 건수와 되살아난 건수가 같다.
-- SELECT (SELECT count(*) FROM public.review_targets_reactivated_20260930) AS snapshot,
--        (SELECT count(*) FROM public.review_targets t
--           JOIN public.review_targets_reactivated_20260930 s ON s.target_id = t.id
--          WHERE t.status = 'active') AS now_active;      -- 기대: 두 값이 같고 ≈82
--
-- 양성: 위 11개 소스에 exhausted 가 남지 않는다.
-- SELECT count(*) FROM public.review_targets
--  WHERE status='exhausted'
--    AND source_key IN ('82cook','bobaedream','brunch','clien','damoang','fmkorea',
--                       'okky','theqoo','todayhumor','tumblbug','velog');     -- 기대: 0
--
-- 음성: 제외한 소스는 그대로 닫혀 있다(UPDATE 가 범위를 넘지 않았다는 증거).
-- SELECT source_key, count(*) FROM public.review_targets
--  WHERE status='exhausted' GROUP BY source_key;   -- 기대: danawa · youtube 만 남는다
--
-- 증분 기준선이 살아 있는지(같은 댓글을 다시 적재하지 않는 근거):
-- SELECT count(*) FROM public.review_targets
--  WHERE status='active' AND last_review_at IS NOT NULL
--    AND source_key IN ('clien','82cook','fmkorea');      -- 기대: 0 이 아니다
