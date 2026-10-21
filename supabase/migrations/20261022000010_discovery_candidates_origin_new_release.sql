-- ============================================================
-- 20261022000010_discovery_candidates_origin_new_release — v71ba P0-1
--
-- 무엇: discovery_candidates.origin CHECK 를 ('mention') → ('mention','new_release') 로 넓힌다.
-- 왜: scripts/new-release-ledger.mjs 는 처음부터 origin='new_release' 를 낸다(v71ay C1, #589). 그런데 CHECK 가 'mention' 만 받아서
--     2026-10-19 새 출시 대장 18행이 origin='mention' 으로 바뀌어 들어갔다(verdict_reason '새 출시 입력(…)' 이 표식).
--     그 결과 "리뷰 속 언급 후보" 칸이 새 출시 입력으로 채워져, 언급 루프가 끊긴 것을 가렸다(상태판 1번이 18행을 언급 산출로 셈).
--     갈래를 DB 에서 가르면 상태판·대장 SQL 이 문자열 표식에 기대지 않아도 된다.
--
-- 🟢 비파괴. 제약을 넓히기만 한다(기존 행 전부 통과). 데이터 UPDATE 없음 — 18행 재분류는 별도 파일
--    20261022000020_new_release_backfill_v71ba.sql(초안, scripts/new-release-backfill.mjs 가 만든다).
--    §10.2 사람 판단 예외 1~8 해당 없음(삭제·데이터 손상·키·법적·돈·명시 지시 충돌 없음).
-- ⚠️ 미적용 — CTO 서브에이전트가 만든 파일. 적용은 오케스트레이터(§10.2).
-- 롤백: 20261022000010_discovery_candidates_origin_new_release_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'discovery_candidates_origin_check';
--     기대: CHECK (((origin IS NULL) OR (origin = 'mention'::text)))

BEGIN;

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates
  ADD CONSTRAINT discovery_candidates_origin_check
  CHECK (origin IS NULL OR origin IN ('mention', 'new_release'));

COMMENT ON COLUMN public.discovery_candidates.origin IS
  '후보 갈래. NULL=HN 발굴(레거시) · mention=리뷰 속 언급 앱(scripts/mention-loop.mjs) · new_release=새 출시·차트·Shopify 공식 목록(scripts/new-release-ledger.mjs).';

COMMIT;

-- ── 적용 후 확인 ──
--   양성(롤백되는 형태):
--     BEGIN; UPDATE public.discovery_candidates SET origin = 'new_release' WHERE id = (SELECT id FROM public.discovery_candidates WHERE origin = 'mention' LIMIT 1); ROLLBACK;  -- 기대: UPDATE 1
--   음성(롤백되는 형태):
--     BEGIN; UPDATE public.discovery_candidates SET origin = 'hn' WHERE id = (SELECT id FROM public.discovery_candidates LIMIT 1); ROLLBACK;  -- 기대: ERROR 23514 discovery_candidates_origin_check
