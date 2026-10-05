-- ============================================================
-- 20261006000003_review_sources_kakao — 카카오(다음) 검색 블로그·카페 2행 등록 (비활성)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1). 적용은 오케스트레이터 몫이다.
-- 선행: 20261005000001(robots_status·tos_status·citation_allowed) · 20261005000003(quote_policy). 없으면 실패한다 — 그게 맞다.
--
-- 근거: 남헌 승인(2026-10-06) — 한국어 데이터 확보용 카카오 검색 어댑터. 키 KAKAO_REST_API_KEY 는 남헌 등록(.env.local·GitHub secret·Vercel).
--   어댑터: lib/review/adapters/kakao.ts (kakao_blog · kakao_cafe). product_ref = q:<검색어>.
--   공식 쿼터(남헌 확인값): 블로그·카페 각 30,000건/일.
--   robots_status='not_applicable' — 공식 키 인증 API(robots 대상이 아니다). 러너는 그래도 dapi.kakao.com/robots.txt 를 판정한다.
--   tos_status='unverified' — 카카오 서비스 약관·Daum 검색 API 이용 조건의 "검색 결과 저장·재이용" 조항을 원문으로 확인하지 못했다.
--     참고(요약 도구로만 읽음, 원문 대조 전): Kakao Developers 운영정책 제5조 20호 "앱에서 사용자 환경을 개선하기 위한 목적 외
--     다른 목적으로 카카오에서 받은 데이터를 캐시하거나 캐시 후 최신 데이터로 유지하지 않는 행위" 금지.
--     → ops/state/source-review-queue.md '대기'. 켜는 것은 남헌(§10.2 예외 4번 — 새 법적 리스크).
--   enabled=false — 남헌이 약관 확인 후 켠다.
--   quote_policy='short_only' · citation_allowed=true.
--
-- ⚠️ 보수적 시드: min_interval_ms 1000(요청 간격 ≥300ms 요구보다 크게) · daily_request_cap 200(공식 쿼터 30,000 의 1% 미만).
--    1요청 = 최대 50건이라 하루 최대 10,000건. 상한은 review-request-cap 이 2배 이내로만 올린다(§10.1).
-- ⚠️ 타깃은 이 파일에 없다 — 행만 만든다(타깃 0 = 요청 0).
--
-- 🟢 비파괴. INSERT 2행(ON CONFLICT DO NOTHING — 재실행 안전). UPDATE·DELETE·DDL 없음. 롤백 파일 있음.
-- ============================================================

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, quote_policy, citation_allowed, last_test_result
) VALUES
  (
    'kakao_blog',
    '카카오(다음) 블로그 검색',
    false,
    '약관 미확인 — 남헌이 카카오 API 이용약관의 검색 결과 저장·재이용 조항 확인 후 켠다 (2026-10-06)',
    'ok', 1000, 200,
    'not_applicable', 'unverified', 'short_only', true,
    '2026-10-06 미실행 — 등록만. 남헌 시험 호출 200 확인(어댑터 경유 아님).'
  ),
  (
    'kakao_cafe',
    '카카오(다음) 카페 검색',
    false,
    '약관 미확인 — 남헌이 카카오 API 이용약관의 검색 결과 저장·재이용 조항 확인 후 켠다 (2026-10-06)',
    'ok', 1000, 200,
    'not_applicable', 'unverified', 'short_only', true,
    '2026-10-06 미실행 — 등록만. 남헌 시험 호출 200 확인(어댑터 경유 아님).'
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, robots_status, tos_status, quote_policy, citation_allowed, min_interval_ms, daily_request_cap
--         FROM public.review_sources WHERE key IN ('kakao_blog', 'kakao_cafe') ORDER BY key;
--   기대 2행: kakao_blog/kakao_cafe · false · not_applicable · unverified · short_only · true · 1000 · 200
--   (ON CONFLICT 로 무시됐으면 값이 다를 수 있다 — 그때는 기존 행을 눈으로 보고 판단한다.)
-- 음성(롤백 형태): 인용 불가 소스는 citation_allowed 를 false 로 못 내린다(short_only 유지 시)
--   BEGIN; UPDATE public.review_sources SET citation_allowed = false WHERE key = 'kakao_blog'; ROLLBACK;  -- 기대: 23514 review_sources_quote_policy_needs_citation
-- 음성: 타깃 0(이 파일은 타깃을 만들지 않는다)
--   SELECT count(*) FROM public.review_targets WHERE source_key IN ('kakao_blog', 'kakao_cafe');  -- 기대: 0
