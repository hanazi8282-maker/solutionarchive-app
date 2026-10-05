-- ============================================================
-- 20261005000004_review_sources_policy_backfill — 기존 소스 21행의 robots_status · tos_status · quote_policy 기록
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2 — 대량 UPDATE 4조건).
-- 선행: 20261005000001 · 20261005000003. 없으면 실패한다(컬럼·'forbids_automation' 값).
-- 근거: 남헌 v19 A(2026-10-05). 리포에 적힌 근거가 있는 칸만 채운다 — 추측 금지.
--
-- 범위: 소스 키를 명시한 21행. 건드리지 않는 것:
--   - appstore → 20261005000002, googleplay → 20261005000005 가 따로 다룬다.
--   - naver_blog · naver_cafe · naver_kin · reddit → main 에 등록 마이그가 없는 행(PR #106 브랜치에서 온 것,
--     docs/migration-exceptions.md 2026-09-18). 근거가 인계 문서·뉴스 교차확인뿐이라 이 파일에서 뺐다.
--   - 근거 없는 칸은 NULL 그대로: tos_status — danawa · damoang · 82cook · brunch · clien · fmkorea(약관 원문을 읽은 기록 없음).
--
-- 값 규칙:
--   - 약관 금지(prohibited · forbids_automation) ⇒ quote_policy='short_only'(v19). 나머지는 기본값 'full' 그대로(안 씀).
--   - tos_status='prohibited' 행은 quote_allowed=false 도 같이 쓴다 — 000001 의 CHECK review_sources_tos_prohibited_no_quote
--     (prohibited ⇒ NOT quote_allowed)가 아직 살아 있어서다. quote_allowed 는 deprecated(코드는 안 읽음)지만 제약은 지켜야 한다.
--
-- 소스별 근거(한 줄씩):
--   danawa          robots allowed      — docs/review-source-findings.md:31 "HTTP 200 · robots 허용", 재실측 docs/strategy-principles.md:85-87(09-18)
--   hackernews      robots unverified   — review-source-findings.md:294-301 정정(4xx=확인 불가, proceedWhenRobotsUnverified 로만 진행)
--                   tos silent          — review-source-findings.md:430-432 "Algolia HN Search API … 이용약관 문서가 없다"
--   damoang         robots allowed      — review-source-findings.md:520-521 (`*` / Allow: /, 우리 UA 미등재. SP-025 AI 봇 반대 의사는 소유자 인수)
--   82cook          robots allowed      — review-source-findings.md:536-557 원문, 재실측 lib/review/adapters/82cook.ts:15(09-24)
--   theqoo          robots unverified   — review-source-findings.md:1060 "robots.txt → 404"(SP-032 표식 그룹)
--                   tos silent          — review-source-findings.md:1154-1157 "/service 200, 평문 6,315자 … 크롤·로봇·자동화 … 0건"
--   todayhumor      robots unverified   — review-source-findings.md:1062-1064 두 origin 404
--                   tos unverified      — review-source-findings.md:1159-1162 "이용약관 페이지를 찾지 못했다 … 확인 불가다"
--   bobaedream      robots allowed      — review-source-findings.md:871-884 "`User-agent: * / Allow: /` … 금지 경로 0개"
--                   tos unverified      — review-source-findings.md:926-931 "약관 페이지를 찾지 못했다 … 전부 404"
--   tumblbug        robots allowed      — review-source-findings.md:682-683, 재실측 lib/review/adapters/tumblbug.ts:201(09-24)
--                   tos forbids_automation — docs/strategy-principles.md SP-031 "'자동화된 수단으로 서비스를 조작·이용' 금지 조항"(소유자 인수 09-17)
--   naver_blog_post robots allowed      — review-source-findings.md:820-821 "기계 판정만 보면 allowed"(robots 본문의 AI·RAG 금지 문구는 SP-030)
--                   tos forbids_automation — review-source-findings.md:796-800 네이버 이용약관 "자동화된 수단(…스크래퍼 등)을 이용하여 … 게시물 등을 수집"
--   brunch          robots allowed      — supabase/migrations/20260919000001_review_sources_brunch_clien_fmkorea.sql:22-26 "글 경로(/@핸들/번호)는 연다"
--   clien           robots allowed      — docs/strategy-principles.md SP-027 재정정(09-24) "우리 UA … 에도 HTTP 200 으로 규칙을 내려준다"
--   fmkorea         robots allowed      — review-source-findings.md:1349-1351 "Allow: /$ /best /best2 /humor"(SP-028 AI 토큰 차단은 소유자 인수)
--   okky            robots allowed      — docs/review-source-findings-round5-b.md:58-65, 재실측 lib/review/adapters/okky.ts:94(09-24)
--                   tos silent          — round5-b.md:95-103 "okky.kr/legal/terms 평문 6,964자 … 0건"
--   velog           robots allowed      — round5-b.md:128-136 "`*` 그룹 규칙 0개 → allowed"
--                   tos silent          — round5-b.md:138-140 "velog.io/policy/terms 평문 4,193자 … 전부 0건"
--   youtube         robots not_applicable — review-source-findings.md:169 "YouTube Data API | 해당 없음(공식 API)"
--                   tos prohibited      — supabase/migrations/20260926000001_review_sources_youtube.sql:14-16 Developer Policies III.E.4.d 30일 초과 저장 금지 + 파생 데이터 제한
--   producthunt     robots not_applicable — CLAUDE.md §7.1 예외(토큰 인증 공식 API api.producthunt.com)
--                   tos prohibited      — supabase/migrations/20260930000025_review_sources_producthunt.sql:7,22 "must not be used for commercial purposes"(SP-008)
--   disquiet        robots allowed      — round5-b.md:410 "`Allow: /` + `Disallow: /passwordless` 뿐"
--                   tos forbids_automation — round5-b.md:423-424 relate.kr 약관 "자동화된 수단(매크로·스크래퍼 등)으로 … 수집"(소유자 인수 09-28)
--   devto           robots allowed      — 20260930000042:24 "/api/articles·/api/comments 허용"
--                   tos prohibited      — 20260930000042:14-16 약관 §2 "you may not: modify or copy the materials; use the materials for any commercial purpose"
--   inflearn        robots allowed      — 20260930000042:27 "`*` 는 /community 를 막지 않음"
--                   tos unverified      — 20260930000042:18 "CSR 이라 평문 54자 — 조항을 못 읽었다"
--   yozm            robots allowed      — 20260930000042:29 "robots 200 · `*`: Allow /magazine/"(같은 날 오전 302 는 재실측으로 대체)
--                   tos unverified      — 20260930000042:21 "약관 자동수집 조항은 인용하지 못했다"
--   indiehackers    robots allowed      — 20260930000044_indiehackers_interviews.sql:23 "robots 200 · `Disallow:`(빈 값) → allowed"(09-25 문서의 Disallow / 는 09-30 실측으로 대체)
--                   tos prohibited      — 20260930000044:18-19 "you won't use, copy, reproduce … any Content not owned by you … without the prior consent"
--
-- 🟡 대량 UPDATE(21행)지만 비파괴: 바꾸는 칸 전부 000001 적용 시 NULL/기본값이었다(적용 기록 docs/migration-exceptions.md 2026-10-05:
--   "기존 소스 26행 전부 quote_allowed=true·robots_status NULL"). 롤백 파일이 그 상태로 정확히 되돌린다.
-- 가드: 영향 행이 정확히 21 이 아니면(키 오타·행 없음) 예외 → 전체 롤백.
-- ============================================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources s
     SET robots_status = v.robots,
         tos_status    = v.tos,
         quote_policy  = v.policy,
         quote_allowed = CASE WHEN v.tos = 'prohibited' THEN false ELSE s.quote_allowed END
    FROM (VALUES
      ('danawa',          'allowed',        NULL,                 'full'),
      ('hackernews',      'unverified',     'silent',             'full'),
      ('damoang',         'allowed',        NULL,                 'full'),
      ('82cook',          'allowed',        NULL,                 'full'),
      ('theqoo',          'unverified',     'silent',             'full'),
      ('todayhumor',      'unverified',     'unverified',         'full'),
      ('bobaedream',      'allowed',        'unverified',         'full'),
      ('tumblbug',        'allowed',        'forbids_automation', 'short_only'),
      ('naver_blog_post', 'allowed',        'forbids_automation', 'short_only'),
      ('brunch',          'allowed',        NULL,                 'full'),
      ('clien',           'allowed',        NULL,                 'full'),
      ('fmkorea',         'allowed',        NULL,                 'full'),
      ('okky',            'allowed',        'silent',             'full'),
      ('velog',           'allowed',        'silent',             'full'),
      ('youtube',         'not_applicable', 'prohibited',         'short_only'),
      ('producthunt',     'not_applicable', 'prohibited',         'short_only'),
      ('disquiet',        'allowed',        'forbids_automation', 'short_only'),
      ('devto',           'allowed',        'prohibited',         'short_only'),
      ('inflearn',        'allowed',        'unverified',         'full'),
      ('yozm',            'allowed',        'unverified',         'full'),
      ('indiehackers',    'allowed',        'prohibited',         'short_only')
    ) AS v(key, robots, tos, policy)
   WHERE s.key = v.key;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 21 THEN
    RAISE EXCEPTION 'policy backfill: expected exactly 21 rows, got %', n;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 정책 분포
--   SELECT quote_policy, tos_status, count(*) FROM public.review_sources GROUP BY 1, 2 ORDER BY 1, 2;
--   기대(000002·000005 미적용 기준, 26행): short_only — forbids_automation 3 · prohibited 4 /
--         full — silent 4 · unverified 4 · NULL 11(근거 없는 6 + 손대지 않은 5: appstore·naver_blog·naver_cafe·naver_kin·reddit)
-- 양성: 약관 금지 소스 이름
--   SELECT key FROM public.review_sources WHERE tos_status IN ('prohibited','forbids_automation') ORDER BY 1;
--   기대: devto · disquiet · indiehackers · naver_blog_post · producthunt · tumblbug · youtube
-- 음성: 손대지 않은 5행은 그대로
--   SELECT key, robots_status, tos_status, quote_policy FROM public.review_sources
--    WHERE key IN ('appstore','naver_blog','naver_cafe','naver_kin','reddit');   -- 기대: NULL · NULL · full
-- 음성(롤백 형태): 약관 금지 소스를 full 로 못 올린다
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'devto'; ROLLBACK;  -- 기대: 23514
