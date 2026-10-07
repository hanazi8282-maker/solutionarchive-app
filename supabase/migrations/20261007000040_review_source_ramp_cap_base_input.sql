-- ============================================================
-- 20261007000040_review_source_ramp_cap_base_input
--
-- 퍼센트 램프 cap_base 18행 입력(남헌 승인 2026-10-07, v28 #1 → v32 — 구글플레이만 60 으로 변경).
-- 20261006000002 가 칸만 만들고 값은 "별도 승인으로"로 남겨 둔 것을 지금 넣는다.
--
-- 규칙(승인표 그대로): cap_base = 그 소스의 현재 review_sources.daily_request_cap,
--   pct_step = 50, daily_request_target = floor(cap_base × 0.5), targets_per_run = 10(NOT NULL·기본값 없음).
--   level 은 기본 0, reason 은 NOT NULL·공백 금지라 승인 문구를 넣는다. 나머지 칸은 DEFAULT.
-- 대상 18곳: appstore 200 · hackernews 600 · 82cook 369 · damoang 300 · theqoo 300 · bobaedream 336 · clien 462 ·
--   fmkorea 300 · okky 300 · velog 300 · youtube 200 · brunch 150 · tumblbug 100 · disquiet 52 · devto 60 ·
--   yozm 52 · indiehackers 52 · googleplay 60.
-- 제외: danawa(남헌이 속도 지정 — RAMP_EXCLUDED) · producthunt(비활성 예정) · todayhumor(RAMP_EXCLUDED) ·
--   kakao_blog·kakao_cafe(타깃 0) · 비활성 소스.
-- googleplay 만 같은 마이그에서 daily_request_cap 40→60(남헌 승인). 소유자 예외 소스라 야간 자동 상향이 없어 사람 마이그다.
--
-- 🟢 비파괴. INSERT 18행(ON CONFLICT (source_key) DO NOTHING — 재실행해도 중복·덮어쓰기 없음) + UPDATE 1행(현재값 40 가드).
--    기존 행 변경은 googleplay cap 1건뿐. 삭제 없음. CLAUDE.md §10.2 사람 판단 예외 해당 없음(승인 자체가 남헌).
--    source_key FK(review_sources) — 18개 키 중 하나라도 소스 행이 없으면 FK 위반으로 전체가 롤백된다(조용히 빠지지 않는다).
--    끝의 DO 블록이 18행·값 일치·googleplay cap 60 을 확인하고 어긋나면 RAISE → 트랜잭션 롤백(§7.1: 기존 행이 이미 있어
--    DO NOTHING 이 값을 바꾸지 못한 경우도 여기서 잡힌다).
-- 선행: 20260930000034 · 20261006000002 · 20261007000030 적용(마이그 000030 은 이 INSERT 와 무관하지만 엔진은 함께 쓴다).
-- 롤백: 20261007000040_review_source_ramp_cap_base_input_rollback.sql
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 CEO-STAFF(Opus 사전검토 뒤). 절차:
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 아래 '적용 전' 쿼리로 review_source_ramp 0행 확인
--   3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
-- ============================================================

-- ── 적용 전 확인(information_schema·직접 SELECT, PostgREST head:true 금지 — §7.1) ──
--   SELECT count(*) FROM public.review_source_ramp;                       -- 기대: 0 (2026-10-07 CEO-STAFF 실측)
--   SELECT key, daily_request_cap FROM public.review_sources
--    WHERE key IN ('appstore','hackernews','82cook','damoang','theqoo','bobaedream','clien','fmkorea','okky','velog',
--                  'youtube','brunch','tumblbug','disquiet','devto','yozm','indiehackers','googleplay') ORDER BY key;
--                                                                         -- 기대: 18행, googleplay 40, 나머지는 위 cap_base 와 같음
--   (다르면 멈춘다 — 야간 request-cap 잡이 그사이 값을 바꿨을 수 있다. cap_base 는 "현재 cap" 이라는 규칙이 우선.)

BEGIN;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
SELECT v.source_key, 0, 10, '남헌 승인 2026-10-07 v32 — cap_base 입력(v28 #1)', 50, v.cap_base, (v.cap_base * 50) / 100
  FROM (VALUES
    ('appstore',     200),
    ('hackernews',   600),
    ('82cook',       369),
    ('damoang',      300),
    ('theqoo',       300),
    ('bobaedream',   336),
    ('clien',        462),
    ('fmkorea',      300),
    ('okky',         300),
    ('velog',        300),
    ('youtube',      200),
    ('brunch',       150),
    ('tumblbug',     100),
    ('disquiet',      52),
    ('devto',         60),
    ('yozm',          52),
    ('indiehackers',  52),
    ('googleplay',    60)
  ) AS v(source_key, cap_base)
ON CONFLICT (source_key) DO NOTHING;

-- googleplay cap 40→60(남헌 승인). 현재값 40 가드 — 이미 60 이면 0행(멱등), 다른 값이면 0행 + 아래 DO 블록이 잡는다.
UPDATE public.review_sources SET daily_request_cap = 60 WHERE key = 'googleplay' AND daily_request_cap = 40;

DO $$
DECLARE n int; bad int; gp int;
BEGIN
  SELECT count(*) INTO n FROM public.review_source_ramp WHERE reason = '남헌 승인 2026-10-07 v32 — cap_base 입력(v28 #1)';
  IF n <> 18 THEN RAISE EXCEPTION 'cap_base 입력 행 % 개(기대 18) — 이미 다른 값의 행이 있거나 FK 이전 실패', n; END IF;
  -- cap_base 가 소스의 현재 daily_request_cap 과 다르거나 파생 칸이 규칙과 다르면 중단.
  SELECT count(*) INTO bad FROM public.review_source_ramp r JOIN public.review_sources s ON s.key = r.source_key
   WHERE r.reason = '남헌 승인 2026-10-07 v32 — cap_base 입력(v28 #1)'
     AND (r.cap_base <> s.daily_request_cap OR r.daily_request_target <> (r.cap_base * 50) / 100 OR r.pct_step <> 50 OR r.targets_per_run <> 10);
  IF bad <> 0 THEN RAISE EXCEPTION 'cap_base/상한 불일치 % 행 — 승인표와 현재 daily_request_cap 대조 필요', bad; END IF;
  SELECT daily_request_cap INTO gp FROM public.review_sources WHERE key = 'googleplay';
  IF gp <> 60 THEN RAISE EXCEPTION 'googleplay daily_request_cap=%(기대 60)', gp; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT source_key, cap_base, daily_request_target, pct_step, targets_per_run, level
--   FROM public.review_source_ramp ORDER BY source_key;
--   -- 기대: 18행. cap_base = appstore 200 · hackernews 600 · 82cook 369 · damoang 300 · theqoo 300 · bobaedream 336 · clien 462 ·
--   --   fmkorea 300 · okky 300 · velog 300 · youtube 200 · brunch 150 · tumblbug 100 · disquiet 52 · devto 60 · yozm 52 ·
--   --   indiehackers 52 · googleplay 60. daily_request_target = 100 · 300 · 184 · 150 · 150 · 168 · 231 · 150 · 150 · 150 · 100 · 75 · 50 · 26 · 30 · 26 · 26 · 30.
--   --   (위 target 순서는 cap_base 나열 순서와 같다.) pct_step 전부 50, targets_per_run 전부 10, level 전부 0.
-- SELECT count(*) FROM public.review_source_ramp r JOIN public.review_sources s ON s.key = r.source_key
--  WHERE r.cap_base = s.daily_request_cap;                                                       -- 기대: 18 (야간 cap 자동 상향 전이면)
-- SELECT daily_request_cap FROM public.review_sources WHERE key = 'googleplay';                  -- 기대: 60
-- SELECT count(*) FROM public.review_source_ramp WHERE source_key IN ('danawa','producthunt','todayhumor','kakao_blog','kakao_cafe');  -- 기대: 0
-- 음성(롤백되는 형태):
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, cap_base, daily_request_target)
--        VALUES ('clien', 10, 'x', 462, 231) ON CONFLICT (source_key) DO NOTHING; ROLLBACK;
--   -- 기대: INSERT 0 0 (중복 키는 DO NOTHING — 18행 그대로, 값 불변)
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, pct_step)
--        VALUES ('danawa', 10, 'x', 100); ROLLBACK;                    -- 기대: 23514 review_source_ramp_pct_step_check
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, cap_base)
--        VALUES ('danawa', 10, 'x', 0); ROLLBACK;                      -- 기대: 23514 review_source_ramp_cap_base_check
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason)
--        VALUES ('no-such-source', 10, 'x'); ROLLBACK;                 -- 기대: 23503 (FK)
