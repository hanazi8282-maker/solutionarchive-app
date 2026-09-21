-- 처방 카드 관련성 판정 캐시 (remedy_verdicts) — "권고안 E" 1단계 D 게이트
--
-- 배경: 낱말 겹침으로 뽑은 처방 카드의 **무관 비율이 59.5%** 였다
--   (docs/review-sources-and-remedy-roadmap-2026-09-21.md §3-0 · 속성 14건 × 카드 37장 실측).
--   속성마다 LLM 이 카드를 0(무관)/1(부분)/2(직접)로 채점하고 0 을 화면에서 뺀다. 그 판정을 여기 캐시한다 —
--   결과 화면이 LLM 을 기다리지 않게 하려는 것이 이 테이블의 존재 이유다(§3-4: 속성당 1.0~1.6초).
--
-- 🟢 비파괴. 신규 테이블 1개(CREATE TABLE IF NOT EXISTS)뿐이고 기존 테이블·컬럼·행은 건드리지 않는다.
--    롤백 파일 있음(`_rollback.sql` — DROP TABLE 1줄, 판정 캐시는 다시 판정하면 복원된다).
--
-- 설계에서 갈린 것들:
--   · `card_fingerprint` — 카드 문장(fixLine/failureLine/principleLine)의 sha1. 같은 카드라도 문구가 바뀌면
--     지문이 달라져 **다시 판정한다**. 지문이 어긋난 행은 "판정 없음" 으로 읽는다(§7.1 — 옛 판정을 새 문장에 쓰지 않는다).
--   · `verdict` nullable — NULL 은 "판정을 돌렸는데 해석하지 못했다(미검증)" 다. **무관(0)이 아니다.**
--     화면은 NULL 카드를 숨기지 않고 "미검증" 배지로 내보낸다. 확인 불가를 음성으로 접지 않는다(§7.1).
--   · `human_verdict` — 남헌이 표본을 손으로 채점할 자리(로드맵 §3-6 3번, C 피드백을 컬럼 하나로 얹는다).
--     사람 판정이 있으면 그것이 LLM 판정을 이긴다.
--   · PK (aspect_id, card_kind, card_id) — 한 속성·한 카드에 판정은 하나. 재판정은 UPSERT 로 덮는다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = **service_role 전용** (리포 관례, 20260927000001 헤더 참조).
--   앱의 DB 접근은 전부 서버 라우트(service_role)이고, anon 키로 PostgREST 를 직접 치는 것만 막는다.
--   service_role 은 rolbypassrls=true 라 앱·배치 스크립트는 영향 없다.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가 아니다).
--   사람 또는 대화형/역할 세션이 적용한다. 적용 절차:
--     1) 대상 프로젝트가 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--     2) information_schema 로 remedy_verdicts 가 이미 있는지 확인(PostgREST head:true 로 확인하지 않는다 — §7.1).
--     3) 이 파일 실행 → 하단 확인 쿼리로 테이블·PK·RLS 를 눈으로 본다.
--     4) 백필은 `node --env-file=.env.local scripts/remedy-judge.mjs --all` (LLM 비용 발생, --dry 로 먼저 본다).
--     5) docs/migration-exceptions.md 에 한 줄 남긴다.

CREATE TABLE IF NOT EXISTS public.remedy_verdicts (
  aspect_id        uuid     NOT NULL REFERENCES public.analysis_aspects(id) ON DELETE CASCADE,
  -- 어느 코퍼스의 카드인가. lib/cases/advisor.ts 의 카드 3종과 같은 어휘다.
  card_kind        text     NOT NULL CHECK (card_kind IN ('case_move','failed_angle','principle')),
  -- 코퍼스별 식별자: case_move=case_moves.id · failed_angle=failed_angles.case_key · principle=strategy_principles.sp_id.
  -- 타입이 uuid/text 로 갈려 있어 text 한 컬럼으로 받는다(FK 를 걸지 않는 이유이기도 하다).
  card_id          text     NOT NULL,
  -- 카드 문장의 sha1. 문구가 바뀌면 이 값이 달라지고, 그때 판정은 무효가 된다.
  card_fingerprint text     NOT NULL,
  -- 0=무관 · 1=부분 · 2=직접. NULL = 판정은 돌렸으나 해석 실패(미검증). NULL 을 0 으로 읽지 않는다.
  verdict          smallint CHECK (verdict IS NULL OR verdict IN (0,1,2)),
  judge_model      text     NOT NULL,
  judged_at        timestamptz NOT NULL DEFAULT now(),
  -- 사람이 손으로 채점한 값. 있으면 LLM 판정보다 우선한다.
  human_verdict    smallint CHECK (human_verdict IS NULL OR human_verdict IN (0,1,2)),
  human_graded_at  timestamptz,
  PRIMARY KEY (aspect_id, card_kind, card_id)
);

ALTER TABLE public.remedy_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remedy_verdicts FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.remedy_verdicts IS
  '처방 카드 관련성 판정 캐시(0 무관/1 부분/2 직접). verdict NULL = 미검증이지 무관이 아니다. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.remedy_verdicts.card_fingerprint IS
  '카드 문장 sha1. 지문이 어긋나면 옛 판정을 쓰지 않고 다시 판정한다.';
COMMENT ON COLUMN public.remedy_verdicts.human_verdict IS
  '남헌 수기 채점. LLM 판정(verdict)보다 우선한다.';

-- 확인 쿼리 (적용 후)
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='remedy_verdicts' order by ordinal_position;   -- 8행
--   select relrowsecurity, relforcerowsecurity from pg_class where relname='remedy_verdicts';  -- true / true
--   select count(*) from pg_policies where tablename='remedy_verdicts';                        -- 0 (service_role 전용)
--   select count(*) from public.remedy_verdicts;                                               -- 0 (백필 전)
