-- ============================================================
-- 20261009000061_area3_uncollected_first — 영역 ③ 미수집 5제품 타깃을 다음 실행 맨 앞으로 (CEO-staff v44 §5·§6 항목 5 / v43 §6)
--
-- ⛔ 미적용 — CTO 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1·§10.2). 적용은 오케스트레이터.
--
-- 왜 이 방법: review_targets 에 우선순위 칸이 없다(실측 — 스키마·store.ts 어디에도 없음). 방문 순서를 정하는 것은
--   lib/review/store.ts:58-66 due() 의 `ORDER BY last_run_at ASC NULLS FIRST LIMIT <1회 타깃 수>` 하나뿐이고,
--   구글 플레이만 그 위에 runner.ts:129 orderGooglePlayTargets(미방문 ∧ 같은 프로젝트 앱스토어 exhausted = 0순위)를 얹는다.
--   그래서 가장 작은 변경 = 대상 행의 last_run_at 을 NULL 로(= 미방문 취급) 되돌리는 것. 코드·칸·램프 변경 0.
--   v37(20261008000020)이 같은 장치(last_run_at=NULL)를 "앞순위"로 이미 썼다.
--
-- 대상: appstore·googleplay ∧ active ∧ total_collected = 0 ∧ label 이 ③ 5제품(adcreative-ai·foreplay·motion-creative·simplified·predis-ai)
--   의 kr·us·us-en 꼴. exhausted·failed 는 건드리지 않는다(되살리기는 이 파일 범위 밖 — 그건 status 변경이다).
--   예상 최대 9행(v37 이 넣은 us 5 + us-en 4). 10행을 넘으면 RAISE(라벨 규칙이 생각과 다르다는 뜻).
--
-- ⚠️ 한계(§7.2): 앞에 세워도 그 스토어에 리뷰가 없으면 0건으로 끝난다(앱스토어는 비증분형이라 빈 피드면 바로 exhausted).
--   v37 이후에도 0이면 우선순위가 아니라 공급 자체(그 시장 리뷰 부재)가 원인이다 — 그때는 소스 교체 판단(config/areas.json abandon).
-- 🟢 비파괴. UPDATE 1열(last_run_at). 이전 값은 NOTICE 로 남긴다. 롤백 파일 있음.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _a3 ON COMMIT DROP AS
SELECT id, label, source_key, product_ref, last_run_at
  FROM public.review_targets
 WHERE source_key IN ('appstore', 'googleplay')
   AND status = 'active'
   AND total_collected = 0
   AND label ~ '^3:(us\||us-en\|)?(adcreative-ai|foreplay|motion-creative|simplified|predis-ai)$';

DO $$
DECLARE n int; r record;
BEGIN
  SELECT count(*) INTO n FROM _a3;
  IF n > 10 THEN RAISE EXCEPTION '대상 %행(기대 ≤ 10) — 라벨 규칙 확인', n; END IF;
  -- 지금 도는 수집이 있으면 saveTargetProgress 가 last_run_at 을 덮는다 → 멈춘다.
  IF EXISTS (SELECT 1 FROM public.review_collection_runs WHERE status = 'running' AND source_key IN ('appstore', 'googleplay')) THEN
    RAISE EXCEPTION 'appstore/googleplay 수집이 돌고 있다 — 끝난 뒤 적용';
  END IF;
  FOR r IN SELECT * FROM _a3 ORDER BY label LOOP
    RAISE NOTICE 'a3 % % % last_run_at % → NULL', r.id, r.source_key, r.label, r.last_run_at;
  END LOOP;
END $$;

UPDATE public.review_targets t SET last_run_at = NULL FROM _a3 a WHERE t.id = a.id;

COMMIT;

-- ── 적용 후 확인 ───────────────────────────────────────────────
-- 양성: SELECT source_key, label, last_run_at, total_collected FROM public.review_targets
--        WHERE label ~ '^3:(us\||us-en\|)?(adcreative-ai|foreplay|motion-creative|simplified|predis-ai)$' ORDER BY 1, 2;
--   기대: active ∧ total_collected=0 행은 last_run_at NULL, 나머지 행은 그대로.
-- 효과(다음 야간 수집 뒤): 위 행들의 last_run_at 이 채워지고 review_collection_runs 요약 perTarget 에 이 product_ref 가 보인다.
