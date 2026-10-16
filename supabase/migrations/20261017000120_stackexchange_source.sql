-- ============================================================
-- 20261017000120_stackexchange_source — v71ad §5(d): Stack Exchange 질문(API 2.3, 무키) 소스 행 **등록만(enabled=false, 타깃 0)**
--
-- ⛔ 미적용 상태로 PR 에 올린다. ⚠️ **적용해도 수집은 0** — 꺼진 채로 라벨만 남긴다.
-- 왜 꺼 두나(2026-10-17 실측, 무키, 요청 9회): 영역 ①~⑤ 태그의 최근 90일 질문 수가 superuser microsoft-teams 2 · zoom 1 · webapps google-meet 2 ·
--   softwarerecs note-taking 0 · superuser microsoft-word 5. 태그 7개를 다 돌려도 하루 0.1건 안팎 [추정] — 요청 값어치가 없다.
--   켜는 판단(그리고 타깃 프로젝트 연결)은 이 수치를 본 사람·역할 세션이 한다. 코드(#563 stackexchange 어댑터)는 이미 준비돼 있다.
-- 근거: 남헌 v71ad §5(d) 승인(2026-10-17).
--
-- ── 소스 근거 ──
--   API: GET https://api.stackexchange.com/2.3/questions?order=desc&sort=creation&site=<s>&tagged=<t>&pagesize=50&filter=withbody → 200 JSON(gzip).
--     무키 한도: quota_max 300(IP 당 하루). 스로틀은 HTTP 400(error_id 502) → 어댑터 blockStatuses 로 첫 응답에서 멈춘다.
--   robots: api.stackexchange.com/robots.txt → 400 JSON(no_method) → robots_status='not_applicable'(공식 API).
--   약관/라이선스: 사용자 콘텐츠 CC BY-SA(출처 표시 필요). API 이용 약관의 상업 이용 조건은 이 세션에서 원문 확인하지 않았다 → tos_status='unverified'.
--   인용: quote_policy='none', quote_allowed=false, citation_allowed=true. 작성자(owner) 저장 안 함, 본문 @멘션은 @user.
--   시드: min_interval_ms 20000(backoff 여유) · daily_request_cap 40 · 램프 cap_base 40 → 50% = 하루 20요청 · 회당 타깃 2.
--
-- 🟢 비파괴·멱등. INSERT 만(review_sources 1 · review_source_ramp 1). UPDATE·DELETE·DDL 없음.
-- 롤백: 20261017000120_stackexchange_source_rollback.sql
-- ============================================================

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES (
  'stackexchange',
  'Stack Exchange 질문(API 2.3, 무키)',
  false,
  'v71ad 등록만 — 90일 질문 수 0~5건(태그별)이라 켜지 않았다. 켜기는 사람·역할 세션 판단.',
  'ok', 20000, 40,
  'not_applicable', 'unverified', NULL, 'none', false, true,
  '낮음 — 공개 Q&A. owner 객체를 읽지 않는다(authorMasked=null). 본문 @멘션은 @user.',
  '2026-10-17 무키 API 9회(전부 200, quota 300/일). 활동량 낮음 — 등록만.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
VALUES ('stackexchange', 0, 2, 'v71ad §5(d) — 등록만(enabled=false). 켜면 50% 출발', 50, 40, 20)
ON CONFLICT (source_key) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key = 'stackexchange' AND NOT enabled AND disabled_reason IS NOT NULL AND robots_status = 'not_applicable' AND tos_status = 'unverified'
     AND quote_policy = 'none' AND NOT quote_allowed AND citation_allowed AND min_interval_ms = 20000 AND daily_request_cap = 40;
  IF n <> 1 THEN RAISE EXCEPTION 'review_sources 값 불일치 — 기대 1행, 일치 %행', n; END IF;
END $$;

COMMIT;

-- 확인: SELECT key, enabled, disabled_reason, tos_status FROM public.review_sources WHERE key = 'stackexchange';   -- f · 사유 · unverified
