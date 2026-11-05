-- ============================================================
-- 20261103000010_dm_targets_register — v71by §2: DM 대상 회사 수집 대기열 등록 + 뉴플로이·타임인아웃 재수집
--
-- 무엇: (1) 새 프로젝트 5개 + 타깃(앱스토어 8 · 구글 플레이 5) 등록, (2) 기존 타깃 4개 exhausted → active (1회 재수집).
--   · 핀플·알파요(우리요) 한 프로젝트: 앱스토어 4앱 + 구글 플레이 4패키지(회사 공식 사이트에 걸린 스토어 링크에서 읽음)
--   · y-BE · 메디플로우 · 플젝클라우드: 앱스토어 1앱씩(공식 사이트에 구글 플레이 링크 없음 → 확인 불가, 등록 안 함)
--   · 마이근무: 앱스토어 6758667869(sellerName=StedyWorks, sellerUrl=mygeunmu.com 일치) + 구글 플레이 com.stedyworks.myshift
--     (후보 6772885787 은 개발자 Younghyun Song · sellerUrl 없음 → 불일치, 등록 안 함)
--   · 슬기로운 알바관리: 웹 SaaS(스토어 링크 없음) → 앱 없음, 등록 안 함
--   · 뉴플로이(앱스토어 950277801 · 구글 com.sidea.hanchon) · 타임인아웃(1273194196 · kr.timehub.timeinout.android) 재수집
-- 기존에 켜진 소스(appstore · googleplay)만 쓴다. 새 소스 종류·소스 on/off·한도·램프 변경 없음 — 러너가 daily_request_cap·ramp 예산 안에서만 돈다.
-- 🟢 add-only + status 1칸(active). 재수집은 cursor·last_review_at·total_collected 를 건드리지 않아 이미 본 리뷰를 다시 적재하지 않는다.
-- 롤백: 20261103000010_dm_targets_register_rollback.sql (스냅샷 표로 이 실행이 만든 행·바꾼 행만)
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT count(*) FROM public.analysis_projects WHERE competitor_url IN
--     ('https://pinpl.biz/','https://www.yhdatabase.com/ybe','https://mygeunmu.com/','https://mediflow.kr/','https://hr.pljec.cloud/');   -- 기대: 0
--   SELECT t.status, count(*) FROM public.review_targets t JOIN public.analysis_projects p ON p.id=t.project_id
--    WHERE p.competitor_url IN ('https://www.newploy.net/','https://www.timeinout.kr/') GROUP BY 1;                                       -- 기대: exhausted 4

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_targets_registered_20261103 (
  id bigserial PRIMARY KEY,
  target_id uuid,
  kind text NOT NULL CHECK (kind IN ('project','new','reactivated')),
  prev_status text,
  project_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_targets_registered_20261103 ENABLE ROW LEVEL SECURITY;

-- 1. 프로젝트(없을 때만)
WITH want(url, pitch) AS (VALUES
  ('https://pinpl.biz/',            '핀플·알파요(우리요) — 근태·출퇴근·연차·근로계약 / 알바 시급·명세서 관리'),
  ('https://www.yhdatabase.com/ybe','y-BE (YH데이타베이스) — 통합 HR(근태·업무) 솔루션'),
  ('https://mygeunmu.com/',         '마이근무 (스테디웍스) — 매장 출퇴근·자동 근무표'),
  ('https://mediflow.kr/',          '메디플로우 — 의료기관 출퇴근·휴가·근태 관리'),
  ('https://hr.pljec.cloud/',       '플젝클라우드 (지후소프트) — 협업·HR 워크 플랫폼')
), ins AS (
  INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status, mode)
  SELECT w.url, w.pitch, 'product_fit', 'collecting', 'forward'
    FROM want w WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.competitor_url = w.url)
  RETURNING id
)
INSERT INTO public.review_targets_registered_20261103 (kind, project_id) SELECT 'project', ins.id FROM ins;

-- 2. 타깃(없을 때만)
WITH want(url, source_key, product_ref, label) AS (VALUES
  ('https://pinpl.biz/','appstore','kr:1493507438','4:pinpl'),
  ('https://pinpl.biz/','appstore','kr:1493505553','4:pinpl'),
  ('https://pinpl.biz/','appstore','kr:1063671772','4:pinpl'),
  ('https://pinpl.biz/','appstore','kr:1083860608','4:pinpl'),
  ('https://pinpl.biz/','googleplay','kr:ko:com.wooriyo.pinpl','4:pinpl'),
  ('https://pinpl.biz/','googleplay','kr:ko:com.wooriyo.pinplm','4:pinpl'),
  ('https://pinpl.biz/','googleplay','kr:ko:com.wooriyo.arpayoee','4:pinpl'),
  ('https://pinpl.biz/','googleplay','kr:ko:com.wooriyo.arpayoer','4:pinpl'),
  ('https://www.yhdatabase.com/ybe','appstore','kr:6444930690','4:ybe'),
  ('https://mygeunmu.com/','appstore','kr:6758667869','4:mygeunmu'),
  ('https://mygeunmu.com/','googleplay','kr:ko:com.stedyworks.myshift','4:mygeunmu'),
  ('https://mediflow.kr/','appstore','kr:1629594110','4:mediflow'),
  ('https://hr.pljec.cloud/','appstore','kr:1571449637','4:pljec')
), ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label)
  SELECT p.id, w.source_key, w.product_ref, w.label
    FROM want w JOIN public.analysis_projects p ON p.competitor_url = w.url
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id AND t.source_key = w.source_key AND t.product_ref = w.product_ref)
  RETURNING id, project_id
)
INSERT INTO public.review_targets_registered_20261103 (target_id, kind, project_id) SELECT id, 'new', project_id FROM ins;

-- 3. 뉴플로이·타임인아웃 재수집(exhausted → active, status 1칸)
WITH tgt AS (
  SELECT t.id, t.project_id, t.status FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
   WHERE p.competitor_url IN ('https://www.newploy.net/','https://www.timeinout.kr/') AND t.status = 'exhausted'
), upd AS (
  UPDATE public.review_targets t SET status = 'active' FROM tgt WHERE t.id = tgt.id RETURNING t.id, tgt.project_id, tgt.status AS prev
)
INSERT INTO public.review_targets_registered_20261103 (target_id, kind, prev_status, project_id) SELECT id, 'reactivated', prev, project_id FROM upd;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_targets_registered_20261103 WHERE kind = 'new') > 13 THEN
    RAISE EXCEPTION '새 타깃이 13개를 넘는다';
  END IF;
  IF (SELECT count(*) FROM public.review_targets_registered_20261103 WHERE kind = 'reactivated') > 4 THEN
    RAISE EXCEPTION '재활성화가 4개를 넘는다';
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
-- 양성: SELECT kind, count(*) FROM public.review_targets_registered_20261103 GROUP BY 1;     -- 기대: project 5 · new 13 · reactivated 4
-- 양성: SELECT p.competitor_url, count(t.id) FROM public.analysis_projects p LEFT JOIN public.review_targets t ON t.project_id=p.id
--        WHERE p.competitor_url IN ('https://pinpl.biz/','https://www.yhdatabase.com/ybe','https://mygeunmu.com/','https://mediflow.kr/','https://hr.pljec.cloud/') GROUP BY 1;  -- 기대: 8·1·2·1·1 개(프로젝트당 타깃 수가 아니라 핀플 8, y-BE 1, 마이근무 2, 메디플로우 1, 플젝 1)
-- 음성: SELECT count(*) FROM public.review_targets WHERE product_ref = 'kr:6772885787';      -- 기대: 0 (불일치 후보는 등록하지 않았다)
