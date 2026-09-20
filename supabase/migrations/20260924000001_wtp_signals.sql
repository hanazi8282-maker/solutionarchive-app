-- 지불의사(WTP) 신호 수집 — 경쟁조사 문서의 "WTP 신호 수집 로직" 항목 (2026-09-21, 남헌 후속 지시 3번)
--
-- 적용: CLAUDE.md §10.2 자체 판단. 신규 테이블 1개(CREATE TABLE IF NOT EXISTS), 기존 테이블 변경 없음. 롤백 `_rollback.sql`.
--
-- 무엇을 담나: 진단 결과 화면(/analyze/[id]/result)에서 사용자가 "이 진단에 얼마까지 내겠나" 에 답한 값.
--   가격을 매기는 표가 아니다 — 가격 정책은 사업 방향(§10.2 예외)이라 사람이 정한다. 이 표는 그 결정의
--   **재료(신호)**만 모은다. 답하지 않은 것과 0원은 다르다: 안 답하면 행이 없고, "안 내겠다" 는 would_pay=false 다.
--
-- ⚠️ 한 프로젝트·한 사람이 여러 번 답할 수 있다(생각이 바뀐다). 최신 1건이 아니라 이력 전체를 남긴다.

CREATE TABLE IF NOT EXISTS public.wtp_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  owner_email   text NOT NULL,
  -- 어느 화면·어느 순간의 답인가. result=진단 결과 화면 하단 카드.
  surface       text NOT NULL DEFAULT 'result' CHECK (surface IN ('result','review','angles')),
  would_pay     boolean NOT NULL,
  -- 원 단위. would_pay=false 면 NULL. 상한 10,000,000 은 오타 방어(1억 같은 값).
  amount_krw    integer CHECK (amount_krw IS NULL OR (amount_krw >= 0 AND amount_krw <= 10000000)),
  -- 일회성 / 월 구독 중 어느 형태로 낼 의향인가. 경쟁조사 가격 모델(일회성 저가 + 선택적 구독) 의 두 갈래.
  billing       text CHECK (billing IS NULL OR billing IN ('one_off','monthly')),
  note          text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wtp_signals_no_amount_when_no_pay CHECK (would_pay OR amount_krw IS NULL)
);

CREATE INDEX IF NOT EXISTS wtp_signals_project_idx ON public.wtp_signals (project_id, created_at DESC);

COMMENT ON TABLE public.wtp_signals IS
  '지불의사 신호 이력. 가격표가 아니라 가격 결정의 재료다. 안 답함(행 없음)과 안 내겠다(would_pay=false)를 가른다.';

-- 확인 쿼리
-- SELECT count(*) FROM public.wtp_signals;
