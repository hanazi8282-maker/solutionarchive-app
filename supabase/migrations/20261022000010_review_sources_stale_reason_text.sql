-- ============================================================
-- 20261022000010_review_sources_stale_reason_text — v71ba P0-4·5: 소스 사유 텍스트 2건 정리
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2). 예외 1~8 해당 없음:
--   삭제 없음 · 텍스트 칸 2행만 · enabled·override·robots_status·health 는 건드리지 않는다 · 롤백이 원문을 그대로 되돌린다.
--
-- (1) appstore.disabled_reason → NULL.
--   사실 확인(2026-10-22): enabled=true · override='owner_2026-10-05' · health ok(오케스트레이터 DB 실측).
--   itunes.apple.com/robots.txt 는 지금도 `User-agent: *` · `Disallow: /*/rss/*` 이고 리포 판정기 결과 disallowed(우리 UA, HTTP 200 · 447B).
--   즉 "robots 금지"는 여전히 사실이지만 그 사실은 robots_status='disallowed'·override 두 칸이 이미 담고 있다.
--   disabled_reason 의 문구(20260910000002 — "매처 버그로 수집해왔음 … BYO 붙여넣기 경로로 대체")는 꺼졌던 시점의 사유라
--   켜진 소스에 남으면 "꺼진 이유"로 읽힌다. 20261005000002 가 롤백 편의로 일부러 남겨 둔 것이다(그 파일 머리말).
--   disabled_at 은 건드리지 않는다(언제 꺼졌었는지의 기록 — 원값을 이 파일이 모르므로 되돌릴 수 없는 변경을 하지 않는다).
--
-- (2) stackexchange.disabled_reason 에 약관 사유 한 줄을 덧붙인다(enabled=false 유지 — 켜지 않는다).
--   2026-10-22 원문 확인: Acceptable Use Policy "Content Scraping/Bot Policy" — "you may not use … any automated system …
--   to access any Network website or Service, or to collect, gather, or copy any text … for the purpose of: Building a similar or
--   competitive website, product, or service; or Developing, building, training, testing, indexing, benchmarking, or improving any
--   generative AI, chatbot, large language, or machine learning tool, model, or platform, or any similar technology."
--   API Terms of Use 는 Public Network Terms(AUP 포함)에도 묶인다고 적는다. 우리 파이프라인은 수집분을 LLM 판정·추출에 넣는다 —
--   "machine learning … platform" 에 걸리는지 확인 불가 → 켜지 않는다(§7.1, §10.2 예외 4). 기대 수확도 하루 0.2건(20261019000030 머리말).
--   20261019000030_stackexchange_enable 은 적용하지 않는다.
--
-- 롤백: 20261022000010_review_sources_stale_reason_text_rollback.sql
-- ============================================================

-- 적용 전 확인(눈으로):
--   SELECT key, enabled, override, robots_status, disabled_reason, disabled_at FROM public.review_sources WHERE key IN ('appstore', 'stackexchange');
--   기대: appstore true · owner_2026-10-05 · disallowed · 'robots.txt 위반 — …' / stackexchange false · reason 있음

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources
     SET disabled_reason = NULL
   WHERE key = 'appstore' AND enabled AND override = 'owner_2026-10-05' AND disabled_reason LIKE 'robots.txt 위반%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 1 THEN RAISE EXCEPTION 'appstore: expected <=1 row, got %', n; END IF;

  UPDATE public.review_sources
     SET disabled_reason = disabled_reason || ' | 2026-10-22 약관: AUP Content Scraping/Bot Policy 가 생성형 AI·ML 플랫폼 목적 자동 수집을 금지 — 우리 용도(LLM 판정·추출)가 걸리는지 확인 불가라 켜지 않음(v71ba P0-5).'
   WHERE key = 'stackexchange' AND NOT enabled AND disabled_reason IS NOT NULL AND position('v71ba P0-5' in disabled_reason) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 1 THEN RAISE EXCEPTION 'stackexchange: expected <=1 row, got %', n; END IF;
END $$;

COMMIT;

-- 적용 후 확인:
--   양성: SELECT key, enabled, disabled_reason FROM public.review_sources WHERE key IN ('appstore', 'stackexchange');
--     기대: appstore true · NULL / stackexchange false · '… v71ba P0-5).' 로 끝남
--   음성: SELECT count(*) FROM public.review_sources WHERE key = 'stackexchange' AND enabled;  -- 기대 0
--   두 번 적용해도 같다(stackexchange 는 position 가드, appstore 는 LIKE 가드).
