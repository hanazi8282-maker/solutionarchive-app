-- ============================================================
-- 20260912000001_onboarding_quiz_responses
--
-- Stage 6 — 판정 신뢰도 자가진단 온보딩 퀴즈("감 점수")의 응답 로그.
-- 신규 유저에게 "성공한 소구점 1개 vs 실패한 소구점 1개"를 순서를 섞어
-- 10문항 보여주고, 어느 쪽이 반응이 좋았는지 고르게 한다.
--   정답 쪽  = case_moves WHERE outcome_direction='positive'
--   오답 쪽  = failed_angles (제품 트랙 실패 원장)
-- 목적 셋: 첫 경험 게임화 · SNS 공유 바이럴 루프 · 콜드스타트 학습 데이터.
--
-- 트랙 분리(§20/§21): 이 테이블은 제품 트랙이다. 방법론 트랙 테이블
-- (case_studies/case_moves/case_evidence)로 향하는 **FK 를 두지 않는다** —
-- 컬럼은 uuid 로만 잡고 조인은 조회 시점에 한다. 이유 둘:
--   (1) failed_angles 가 같은 이유로 FK 를 금지했다(20260911000003 헤더).
--   (2) 이건 로그다. ON DELETE CASCADE/SET NULL 로 "무엇을 보여줬는지"라는
--       과거 사실이 지워지면 학습 데이터로서의 값이 사라진다.
-- case_moves 의 **성공 쪽만** 빌려 읽는다. outcome_direction='negative'(방법론
-- 트랙 CMO 콘텐츠 소재)는 쓰지 않는다 — §13-2 의 혼용 금지. 성공 쪽 읽기는
-- 기존 어드바이저 UI(app/analyze/[id]/angles/page.tsx "선례·성공 사례")가
-- 이미 제품 화면에서 하는 것과 같아서 새 혼용이 아니다.
--
-- ★ 신원(identity) 모델 — session_id 가 주 식별자인 이유
--   이 리포에는 아직 사용자 인증이 없다. lib/supabase/server.ts 가 service_role
--   키로 RLS 를 우회하고 있고 주석에 "TODO: Google SSO 완성 후 사용자 세션
--   기반으로 교체"가 그대로 남아 있다. 마이그레이션 전체에서 RLS 정책을 가진
--   테이블은 0개다. 온보딩은 정의상 로그인 이전 경험이라 익명으로 동작해야
--   한다. 그래서:
--     session_id text NOT NULL — 클라이언트가 만든 UUID 를 localStorage 에
--       보관해 재사용한다. 지금의 유일한 실제 식별자다.
--     user_id uuid NULL — Google SSO 도입 시를 위한 자리만 만든다. 현재 항상
--       NULL 이고 **FK 를 걸지 않는다**. auth.users 참조는 SSO 도입 시 별도
--       마이그레이션에서 붙인다(지금 걸면 존재하지 않는 계정 체계에 의존한다).
--
-- ★ 왜 한 테이블에 event_type 을 두는가 (AC-1)
--   문항 응답 행만으로는 "시작했지만 중간 이탈"을 셀 수 없다. 그래서 start /
--   answer / complete 세 이벤트를 같은 테이블에 남긴다. 별도 이벤트 테이블을
--   만들지 않은 이유는 완주율이 한 테이블 한 쿼리로 나오기 때문이다:
--
--     SELECT
--       count(DISTINCT session_id) FILTER (WHERE event_type = 'start')    AS started,
--       count(DISTINCT session_id) FILTER (WHERE event_type = 'complete') AS completed,
--       round(
--         100.0 * count(DISTINCT session_id) FILTER (WHERE event_type = 'complete')
--         / NULLIF(count(DISTINCT session_id) FILTER (WHERE event_type = 'start'), 0)
--       , 1) AS completion_rate_pct
--     FROM public.onboarding_quiz_responses;
--
--   분모가 0이면 NULL 이 나온다 — 0% 로 접지 않는다(§7.1: 없음 ≠ 0).
--
-- ⚠️ 미적용 (CLAUDE.md §10.1). 남헌이 대시보드에서 직접 실행. 프로젝트 ref: qmgrfqjfxqhxuufrnkwf
-- ============================================================

CREATE TABLE IF NOT EXISTS public.onboarding_quiz_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 익명 온보딩의 주 식별자. 클라이언트 localStorage UUID.
  session_id            text NOT NULL CHECK (length(session_id) BETWEEN 8 AND 64),

  -- Google SSO 이후를 위한 자리. 지금은 항상 NULL, FK 없음(위 헤더 참고).
  user_id               uuid,

  event_type            text NOT NULL
                          CHECK (event_type IN ('start', 'answer', 'complete')),

  -- 정답 쪽으로 보여준 case_moves 행. FK 아님(트랙 분리 + 로그 불변성).
  pair_case_move_id     uuid,
  -- 오답 쪽으로 보여준 failed_angles 행. 같은 이유로 FK 아님.
  pair_failed_angle_id  uuid,

  -- 화면에 뜬 두 카드 중 사용자가 고른 쪽. 'a'/'b' 는 **표시 순서**이고
  -- 순서는 문항마다 섞인다. 정답 여부는 is_correct 가 들고 있다.
  picked_side           text CHECK (picked_side IN ('a', 'b')),
  is_correct            boolean,

  -- complete 이벤트에만 채운다. score 를 answer 행에서 매번 집계하지 않고
  -- 여기 적는 이유: 퍼센타일 계산이 한 테이블 한 번 스캔으로 끝난다.
  -- question_count 를 같이 적는 이유: 문항 수(현재 10)가 바뀌어도 과거 점수의
  -- 분모를 복원할 수 있다. 분모 없는 점수는 나중에 아무도 못 읽는다.
  score                 smallint CHECK (score >= 0),
  question_count        smallint CHECK (question_count > 0),

  created_at            timestamptz NOT NULL DEFAULT now(),

  -- answer 행은 페어·선택이 반드시 있고, start/complete 행은 반드시 없다.
  -- 비워둔 answer 행이 섞이면 학습 데이터가 조용히 오염된다.
  CONSTRAINT oqr_answer_shape CHECK (
    (event_type = 'answer'
      AND pair_case_move_id IS NOT NULL AND pair_failed_angle_id IS NOT NULL
      AND picked_side IS NOT NULL AND is_correct IS NOT NULL)
    OR
    (event_type <> 'answer'
      AND pair_case_move_id IS NULL AND pair_failed_angle_id IS NULL
      AND picked_side IS NULL AND is_correct IS NULL)
  ),

  -- 점수는 complete 행만 가진다. 0 <= score <= question_count.
  CONSTRAINT oqr_complete_shape CHECK (
    (event_type = 'complete'
      AND score IS NOT NULL AND question_count IS NOT NULL AND score <= question_count)
    OR
    (event_type <> 'complete' AND score IS NULL AND question_count IS NULL)
  )
);

COMMENT ON TABLE public.onboarding_quiz_responses IS
  'Stage 6 온보딩 퀴즈("감 점수") 이벤트 로그. start/answer/complete 한 테이블. '
  '완주율 = complete distinct session / start distinct session (헤더에 SQL). '
  '제품 트랙 — 방법론 트랙(case_studies/case_moves) FK 금지(§20/§21), uuid 로만 기록.';
COMMENT ON COLUMN public.onboarding_quiz_responses.session_id IS
  '익명 온보딩의 주 식별자(클라이언트 localStorage UUID). 이 리포에 아직 인증이 없다.';
COMMENT ON COLUMN public.onboarding_quiz_responses.user_id IS
  'Google SSO 이후 자리. 현재 항상 NULL, auth.users FK 는 SSO 도입 시 별도 마이그레이션.';
COMMENT ON COLUMN public.onboarding_quiz_responses.picked_side IS
  '표시 순서상의 a/b. 순서는 문항마다 섞이므로 정답 판정은 is_correct 로만 한다.';
COMMENT ON COLUMN public.onboarding_quiz_responses.question_count IS
  'complete 시점의 분모. 문항 수가 바뀌어도 과거 점수를 해석할 수 있게 같이 적는다.';

-- RLS: 정책 없이 활성화만 (deny-all). 접근은 전부 서버 Route Handler 의
-- service_role 경유 — failed_angles / strategy_principles 와 동일 패턴.
ALTER TABLE public.onboarding_quiz_responses ENABLE ROW LEVEL SECURITY;

-- 세션별 타임라인 조회(같은 세션 재시도 포함).
CREATE INDEX IF NOT EXISTS onboarding_quiz_responses_session_idx
  ON public.onboarding_quiz_responses (session_id, created_at);

-- 퍼센타일·응답자 수 집계 전용. complete 행만 타므로 전체 스캔보다 훨씬 좁다.
CREATE INDEX IF NOT EXISTS onboarding_quiz_responses_score_idx
  ON public.onboarding_quiz_responses (score)
  WHERE event_type = 'complete';

-- 완주율 집계(event_type 별 distinct session).
CREATE INDEX IF NOT EXISTS onboarding_quiz_responses_event_idx
  ON public.onboarding_quiz_responses (event_type, created_at DESC);

-- ============================================================
-- 검증 (적용 직후 — 양성/음성 둘 다)
-- ============================================================
-- 양성 1) start → answer → complete 한 세션이 들어가는가
--   INSERT INTO public.onboarding_quiz_responses (session_id, event_type)
--     VALUES ('selfcheck-session-0001', 'start');
--   INSERT INTO public.onboarding_quiz_responses
--     (session_id, event_type, pair_case_move_id, pair_failed_angle_id, picked_side, is_correct)
--     SELECT 'selfcheck-session-0001', 'answer',
--            (SELECT id FROM public.case_moves WHERE outcome_direction = 'positive' LIMIT 1),
--            (SELECT id FROM public.failed_angles LIMIT 1), 'a', true;
--   INSERT INTO public.onboarding_quiz_responses (session_id, event_type, score, question_count)
--     VALUES ('selfcheck-session-0001', 'complete', 7, 10);
--     기대: 3행 삽입 성공
-- 양성 2) 완주율 쿼리가 도는가 (헤더 SQL 그대로)
--   SELECT count(DISTINCT session_id) FILTER (WHERE event_type = 'start')    AS started,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'complete') AS completed
--     FROM public.onboarding_quiz_responses;
--     기대: started 1, completed 1
-- 음성 1) answer 인데 페어가 비었음 → 거절
--   INSERT INTO public.onboarding_quiz_responses (session_id, event_type, picked_side, is_correct)
--     VALUES ('selfcheck-session-0001', 'answer', 'a', true);
--     기대: ERROR 23514 check constraint "oqr_answer_shape"
-- 음성 2) complete 인데 점수 없음 → 거절
--   INSERT INTO public.onboarding_quiz_responses (session_id, event_type)
--     VALUES ('selfcheck-session-0001', 'complete');
--     기대: ERROR 23514 check constraint "oqr_complete_shape"
-- 음성 3) score > question_count → 거절
--   INSERT INTO public.onboarding_quiz_responses (session_id, event_type, score, question_count)
--     VALUES ('selfcheck-session-0001', 'complete', 11, 10);
--     기대: ERROR 23514 check constraint "oqr_complete_shape"
-- 음성 4) picked_side 어휘 위반 → 거절
--   INSERT INTO public.onboarding_quiz_responses
--     (session_id, event_type, pair_case_move_id, pair_failed_angle_id, picked_side, is_correct)
--     VALUES ('selfcheck-session-0001', 'answer', gen_random_uuid(), gen_random_uuid(), 'c', true);
--     기대: ERROR 23514 check constraint "onboarding_quiz_responses_picked_side_check"
-- 정리) DELETE FROM public.onboarding_quiz_responses WHERE session_id = 'selfcheck-session-0001';
