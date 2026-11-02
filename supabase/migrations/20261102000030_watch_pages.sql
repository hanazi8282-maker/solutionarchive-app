-- ============================================================
-- 20261102000030_watch_pages — v71bv: Visualping 감시 페이지 5곳(flex · Deputy · When I Work · 시프티 · 알밤) 대장
--
-- ⛔ 미적용 상태로 PR 에 올린다(서브에이전트 작성 — 적용은 오케스트레이터).
-- 무엇: 카드 규격(reports/2026-11-01/cmo-v71bt/visualping-card.md, CMO 로컬)의 `monitored_url` 자리를 DB 에 둔다.
--   Visualping 알림 수신 경로(웹훅·API)는 이 파일에 없다 — 받는 쪽 엔드포인트가 리포 어디에도 없고,
--   만들려면 새 공개 경로 + 새 시크릿이 필요하다(§10.2 예외 3). 그래서 대장만 먼저 둔다.
-- url 은 2026-11-02 실측(GET, 최종 URL·200)으로 요금 페이지가 확인된 3곳만 채운다. 나머지 2곳은 NULL(확인 불가):
--   flex  : flex.team/pricing → 홈으로 리다이렉트, /price·/plans → 로그인 페이지. 공개 요금 페이지 못 찾음.
--   albam : albam.net → newploy.net(뉴플로이)로 리다이렉트, albam.co/pricing 404. 공개 요금 페이지 못 찾음.
--   ⚠️ 이 둘에 Visualping 을 걸었다면 감시 대상이 로그인 화면·리다이렉트 홈이라 "변화 없음"만 나온다.
-- 🟢 비파괴·멱등. CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING. RLS 켬·정책 0(service_role 전용, 20260915000002 관례).
-- 롤백: 20261102000030_watch_pages_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT to_regclass('public.watch_pages');   -- 기대: NULL (이미 있으면 컬럼부터 대조)

BEGIN;

CREATE TABLE IF NOT EXISTS public.watch_pages (
  key               text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  company           text NOT NULL,
  url               text CHECK (url IS NULL OR url ~ '^https://'),
  visualping_job_id text,
  enabled           boolean NOT NULL DEFAULT true,
  last_alert_at     timestamptz,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.watch_pages IS
  'Visualping 감시 페이지 대장(v71bv). url NULL = 요금 페이지 확인 불가. last_alert_at NULL = 알림 수신 기록 없음(수신 경로 미구현).';

ALTER TABLE public.watch_pages ENABLE ROW LEVEL SECURITY;

INSERT INTO public.watch_pages (key, company, url, note) VALUES
  ('flex',      'flex',        NULL,                                 '2026-11-02 공개 요금 페이지 못 찾음(/pricing→홈, /price→로그인)'),
  ('deputy',    'Deputy',      'https://www.deputy.com/pricing',     NULL),
  ('wheniwork', 'When I Work', 'https://wheniwork.com/pricing',      NULL),
  ('shiftee',   '시프티',       'https://shiftee.io/ko/pricing',      NULL),
  ('albam',     '알밤',         NULL,                                 '2026-11-02 albam.net→newploy.net 리다이렉트, albam.co/pricing 404')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.watch_pages WHERE key IN ('flex','deputy','wheniwork','shiftee','albam')) <> 5 THEN
    RAISE EXCEPTION 'watch_pages 5행이 아니다';
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
-- 양성: SELECT key, url IS NOT NULL AS has_url FROM public.watch_pages ORDER BY key;   -- 기대: 5행, has_url t 3 · f 2
-- 음성(롤백되는 형태): BEGIN; INSERT INTO public.watch_pages (key, company, url) VALUES ('x', 'x', 'http://a'); ROLLBACK;  -- 기대: CHECK 위반
-- RLS: SELECT relrowsecurity FROM pg_class WHERE oid = 'public.watch_pages'::regclass;  -- 기대: t
