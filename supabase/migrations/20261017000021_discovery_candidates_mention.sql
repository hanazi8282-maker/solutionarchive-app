-- ============================================================
-- 20261017000021_discovery_candidates_mention
--
-- 리뷰 속 언급 앱 루프(남헌 v71ad §1, D-36)의 후보 대장 칸. discovery_candidates 에 nullable 컬럼 10개 + CHECK 3개 + 부분 인덱스 1개.
-- 설계: reports/2026-10-17/mention-loop-design.md §5. 행을 쓰는 것은 scripts/mention-loop.mjs 가 만든 mention-ledger.sql
-- (사람·역할 세션이 실행) — 무인 루프 배선은 이 마이그와 별개다.
--
--   origin              후보를 낸 갈래. NULL = 기존 HN 발굴 행(레거시). 'mention' = 리뷰 속 언급.
--   mention_count       언급 횟수(같은 글 안 다른 역할 포함)
--   post_count          서로 다른 근거 글 수 — 기본 통과 기준 3
--   source_count        서로 다른 수집 소스 수
--   alt_seek_posts      근거 글 중 "대안 탐색 글"(looking for an alternative · 갈아탈 만한 …) 수 — 와일드카드 신호
--   evidence_input_ids  근거 글 analysis_inputs.id (최대 10). FK 는 걸지 않는다(배열) — 원문 폐기(purge)와 무관하게 남긴다
--   area_code           근거 글 대표 영역(①~⑤)
--   area_fit            대표 영역 비중 0~1 — 자동 등록은 0.9 이상
--   gate_blocked        등록 단계에서 막힌 게이트: appstore_30pct · googleplay_80. NULL = 안 막힘
--   last_seen_at        마지막으로 언급이 집계된 날
--   (재제안 방지는 기존 verdict='rejected' + verdict_reason 으로 한다 — 새 칸 없음)
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 만, 기존 행은 전부 NULL(= origin 레거시)이라 CHECK 를 통과한다. 백필 없음. 롤백 파일 있음.
--    §10.2 사람 판단 예외 1~8 해당 없음(삭제·데이터 손상·키·법적·돈 없음).
-- ⚠️ 미적용 — CTO 서브에이전트가 만든 파일(§10.2). 적용은 CEO-staff/역할 세션. 코드(PR feat/v71ad-mention-loop)는 이 칸이 없어도 돈다
--    (dry-run 은 파일만 쓴다). 적용 순서 무관. 적용 전: solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 → information_schema 로 칸 부재 확인.
-- ============================================================

BEGIN;

ALTER TABLE public.discovery_candidates
  ADD COLUMN IF NOT EXISTS origin             text,
  ADD COLUMN IF NOT EXISTS mention_count      integer,
  ADD COLUMN IF NOT EXISTS post_count         integer,
  ADD COLUMN IF NOT EXISTS source_count       integer,
  ADD COLUMN IF NOT EXISTS alt_seek_posts     integer,
  ADD COLUMN IF NOT EXISTS evidence_input_ids uuid[],
  ADD COLUMN IF NOT EXISTS area_code          text,
  ADD COLUMN IF NOT EXISTS area_fit           numeric(4,3),
  ADD COLUMN IF NOT EXISTS gate_blocked       text,
  ADD COLUMN IF NOT EXISTS last_seen_at       timestamptz;

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_origin_check
  CHECK (origin IS NULL OR origin IN ('mention'));

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_gate_blocked_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_gate_blocked_check
  CHECK (gate_blocked IS NULL OR gate_blocked IN ('appstore_30pct', 'googleplay_80'));

-- 언급 후보를 채택(accepted)하려면 근거 글 3개 이상·영역 적합 0.9 이상. 지시 v71ad §1 ③④⑥ 을 DB 가 강제한다.
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_mention_accept_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_mention_accept_check
  CHECK (
    origin IS DISTINCT FROM 'mention' OR verdict <> 'accepted'
    OR (post_count >= 3 AND cardinality(evidence_input_ids) >= 3 AND area_fit >= 0.9 AND area_code IN ('1','2','3','4','5'))
  );

CREATE INDEX IF NOT EXISTS discovery_candidates_origin_idx
  ON public.discovery_candidates (origin, last_seen_at DESC)
  WHERE origin IS NOT NULL;

COMMENT ON COLUMN public.discovery_candidates.origin IS
  '후보 갈래. NULL=HN 발굴(레거시) · mention=리뷰 속 언급 앱(scripts/mention-loop.mjs). 언급 루프 대장 SQL 은 origin=mention 행만 갱신한다.';
COMMENT ON COLUMN public.discovery_candidates.post_count IS '서로 다른 근거 글 수. 언급 후보 채택 하한 3(CHECK).';
COMMENT ON COLUMN public.discovery_candidates.alt_seek_posts IS '근거 글 중 대안 탐색 글 수(와일드카드 신호, 효과 측정 설계 §8).';
COMMENT ON COLUMN public.discovery_candidates.evidence_input_ids IS '근거 analysis_inputs.id 최대 10. FK 없음(배열).';
COMMENT ON COLUMN public.discovery_candidates.area_fit IS '대표 영역 비중 0~1. 언급 후보 채택 하한 0.9(CHECK).';
COMMENT ON COLUMN public.discovery_candidates.gate_blocked IS '등록 단계에서 막은 게이트(appstore_30pct·googleplay_80). 하루 차단 수는 reports/<날짜>/mention-loop.json metrics.gate_blocked.';

COMMIT;

-- 적용 후 확인
--   양성: SELECT column_name FROM information_schema.columns
--          WHERE table_schema='public' AND table_name='discovery_candidates'
--            AND column_name IN ('origin','mention_count','post_count','source_count','alt_seek_posts','evidence_input_ids','area_code','area_fit','gate_blocked','last_seen_at');
--         기대: 10행
--   기존 행 무변경: SELECT count(*) FROM public.discovery_candidates WHERE origin IS NOT NULL;  -- 기대 0
--   음성(롤백되는 형태 — 데이터 안 남음):
--     BEGIN;
--       INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, post_count, evidence_input_ids, area_code, area_fit)
--       VALUES ('saas', '검증용-mention', 'x', 'appstore', 'us:1', 100, 'accepted', 'x', 'mention', 2,
--               ARRAY[gen_random_uuid(), gen_random_uuid()], '5', 1.0);
--       -- 기대: 23514 discovery_candidates_mention_accept_check (글 2 < 3)
--     ROLLBACK;
--     BEGIN;
--       UPDATE public.discovery_candidates SET origin = 'hn' WHERE id = (SELECT id FROM public.discovery_candidates LIMIT 1);
--       -- 기대: 23514 discovery_candidates_origin_check
--     ROLLBACK;
