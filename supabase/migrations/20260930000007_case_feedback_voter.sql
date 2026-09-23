-- ============================================================
-- 20260930000007_case_feedback_voter
--
-- `case_feedback` 에 **익명 1인 1표/일** 을 세기 위한 두 축을 더한다.
--   voter_hash  — sha256(IP + 서버 솔트). 원본 IP 를 저장하지 않는다.
--   session_id  — 쿠키 `sa_vid`(httpOnly, 1년). 같은 브라우저를 잇는 축.
--
-- ⚠️ 선행: **20260930000001_case_detail_logo_feedback 이 먼저 들어가 있어야 한다**
--    (이 파일은 그 마이그레이션이 만드는 `public.case_feedback` 에 컬럼을 더한다).
--    선행이 없으면 `ALTER TABLE` 이 42P01 로 멈춘다 — 그건 실패로 읽어라. 조용히
--    넘어갔다고 이 파일이 적용된 것이 아니다(§7.1).
--
-- 근거: 남헌 2026-09-23 **명시 승인 — 익명 피드백 허용, 하루 1회 제한.**
--       (`/library/<slug>` 의 👍/👎 를 로그인 없이 받는다. 20260930000001 이
--        `user_email` 을 nullable 로 열어 둔 자리가 이제 실제로 쓰인다.)
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 2개(둘 다 nullable, 백필 없음) + 인덱스 1개.
--    기존 행·컬럼·제약을 건드리지 않는다. 롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외:
--      삭제 없음 · 기존 데이터 손상 없음(UPDATE·백필 없음) · 새 수집 소스 아님 ·
--      사업 방향 결정 아님.
--      🟡 "인증 경계를 넓히는 변경" 에는 해당한다(로그인 없이 쓰는 경로를 연다) —
--         그래서 이 건은 위 남헌 2026-09-23 명시 승인을 근거로 한다. 그 승인이 없으면
--         이 파일을 적용하지 마라. `lib/auth/*` · `proxy.ts` 는 건드리지 않았다.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가
--    아니다). 사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 `case_feedback` 과 선행 컬럼이 있는지 확인 —
--         PostgREST head:true 는 없는 테이블에도 204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- 미적용 상태에서 화면은 죽지 않는다: `lib/cases/feedback.ts` 가 42703/PGRST204/
-- 42P01/PGRST205 를 **"오늘 표가 없다"가 아니라 "확인 불가 = 마이그 미적용"** 으로
-- 따로 판정하고(3상태), 폼이 그 문장을 띄우며 **저장하지 않는다.** 하루 1회 제한을
-- 확인할 수 없는 상태에서 저장하는 것은 제한이 없는 것과 같다(§7.1).
--
-- 필요한 env: `FEEDBACK_SALT`(없으면 `CRON_SECRET` 폴백). 둘 다 없으면 앱이 익명 저장을
--   거부한다 — 솔트 없는 sha256(IP) 는 되돌릴 수 있는 값이라 그게 곧 IP 저장이다.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 왜 축이 둘인가 — 하나만으로는 각각 다른 방향으로 틀린다.
--
--   voter_hash 만: 같은 카페·회사 NAT 뒤의 사람들이 한 명으로 합쳐진다(과잉 차단).
--   session_id 만: 쿠키를 지우거나 시크릿 창이면 무제한이 된다(무력).
--
-- 그래서 저장은 둘 다 하고, 판정은 **OR**(둘 중 하나라도 오늘 있으면 거부)로 한다.
-- 과잉 차단 쪽을 택한 것이다 — 이 표는 조사 순서를 정하는 신호라서, 한 사람이 여러 표를
-- 넣는 것이 남의 표 하나가 막히는 것보다 나쁘다.
--
-- ⚠️ 원본 IP 를 컬럼으로 두지 않는다. 필요한 것은 "같은 사람인가"뿐이고, IP 자체는
--    없으면 유출될 수도 없다. 그래서 해시 앞에 서버 솔트를 붙인다 — 솔트가 없으면
--    IPv4 전체를 무차별로 대조할 수 있어 해시가 사실상 평문이다.
--
-- 유니크 제약을 **걸지 않는다.** "하루 1회"의 하루는 KST 달력일이고, 그걸 DB 제약으로
-- 쓰려면 `date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul')` 위의 함수 인덱스가
-- 필요하다. 그건 immutable 하지 않아 유니크 인덱스에 못 쓴다(IMMUTABLE 래퍼를 만드는
-- 것은 되돌리기 어려운 쪽으로 복잡해진다). 판정은 앱의 순수 함수
-- `withinDailyLimit`(lib/cases/feedback.ts)가 하고, 그 함수는 셀프테스트가 지킨다.
-- ponytail: 경합(같은 사람이 동시에 두 번)까지 막아야 하면 그때 위 래퍼 + 유니크.
--           지금은 두 표가 들어와도 신호가 망가지지 않는다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.case_feedback
  ADD COLUMN IF NOT EXISTS voter_hash text,
  ADD COLUMN IF NOT EXISTS session_id text;

COMMENT ON COLUMN public.case_feedback.voter_hash IS
  'sha256(IP + 서버 솔트 FEEDBACK_SALT). 원본 IP 는 저장하지 않는다. NULL = 하루 1회 제한을 확인하지 못한 경로로 들어온 행(구 행) — "IP 없음"이 아니다.';
COMMENT ON COLUMN public.case_feedback.session_id IS
  '쿠키 sa_vid(httpOnly, 1년). voter_hash 와 OR 로 함께 본다 — NAT 합쳐짐(hash만)과 쿠키 삭제(session만)를 서로 메운다.';

-- 하루 1회 판정이 매번 치는 축. (케이스 → 투표자 → 시각) 순서 그대로다.
CREATE INDEX IF NOT EXISTS case_feedback_voter_idx
  ON public.case_feedback (case_study_id, voter_hash, created_at DESC);
-- 쿠키 축도 같은 질의에서 OR 로 쓰인다 — 두 번째 인덱스가 없으면 OR 한쪽이 풀스캔이 된다.
CREATE INDEX IF NOT EXISTS case_feedback_session_idx
  ON public.case_feedback (case_study_id, session_id, created_at DESC);

COMMIT;


-- ============================================================
-- 확인 쿼리 (적용 직후 실행) — 양성·음성 둘 다 돌린다.
-- "에러 안 났다"로 통과 처리하지 않는다(§7.1).
-- ============================================================
--
-- ── 선행 0) 선행 마이그레이션이 들어가 있는가 (없으면 위 ALTER 가 애초에 못 돈다)
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='case_feedback';   -- 기대: 1
--
-- ── 양성 1) 컬럼 2개가 생겼는가
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_feedback'
--    AND column_name IN ('voter_hash','session_id') ORDER BY column_name;
--   기대: 2행 · text · YES
--
-- ── 양성 2) 인덱스 2개
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname='public' AND tablename='case_feedback' ORDER BY indexname;
--   기대: case_feedback_case_idx · case_feedback_pkey · case_feedback_session_idx · case_feedback_voter_idx
--
-- ── 양성 3) 백필되지 않았는가 (구 행에 짐작값이 들어가면 안 된다)
-- SELECT count(*) AS with_voter FROM public.case_feedback
--  WHERE voter_hash IS NOT NULL OR session_id IS NOT NULL;
--   기대: 0 (이 마이그레이션 직후. 이후 익명 표가 들어오면 늘어난다)
--
-- ── 양성 4) 익명 INSERT 가 되는가 (롤백되는 형태로 — 데이터를 남기지 않는다)
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote, note, voter_hash, session_id)
--     SELECT id, 1, '익명 표', repeat('a', 64), 'test-session'
--       FROM public.case_studies WHERE review_status='approved' LIMIT 1;
--   SELECT vote, user_email, left(voter_hash, 8), session_id FROM public.case_feedback
--    WHERE session_id='test-session';        -- 기대: 1 | NULL | aaaaaaaa | test-session
-- ROLLBACK;
--
-- ── 음성 1) 선행 마이그레이션의 제약이 그대로 살아 있는가 (이 파일이 느슨하게 만들지 않았다)
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote, voter_hash)
--     SELECT id, 0, 'x' FROM public.case_studies LIMIT 1;
--   기대: ERROR 23514 check constraint "case_feedback_vote_check"
-- ROLLBACK;
--
-- ── 음성 2) 500자 넘는 한 줄도 여전히 거부돼야 한다
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote, note, voter_hash)
--     SELECT id, 1, repeat('가', 501), 'x' FROM public.case_studies LIMIT 1;
--   기대: ERROR 23514 check constraint "case_feedback_note_check"
-- ROLLBACK;
--
-- ── 음성 3) anon 키로 PostgREST 직접 호출이 막히는가 (RLS — 익명 쓰기를 열었다고
--            브라우저가 직접 INSERT 할 수 있게 된 것은 아니다. 앱 서버만 쓴다)
--   curl -s -X POST -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Content-Type: application/json" -d '{"case_study_id":"...","vote":1}' \
--     "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/case_feedback"
--   기대: 권한 오류. 201 이 오면 정책이 잘못 붙은 것이고 즉시 되돌려야 한다.
