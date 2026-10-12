-- ============================================================
-- 20261015000010_consumer_material_tags — 소비재 자료 태그 (남헌 v61)
--
-- ⛔ **미적용**. 서브에이전트가 파일만 만들었다(CLAUDE.md §10.2) — 적용은 대화형·역할 세션 자체 판단:
--    신규 테이블 1개 · 비파괴 · 롤백 파일 있음(20261015000010_consumer_material_tags_rollback.sql) · 기존 표·행 무변경.
--    적용 후 `docs/migration-exceptions.md` 에 한 줄.
--
-- 왜: "소비재 관련 판정은 관련 없음으로 취급하고 소비재 자료로 태그한다. 판정 대기열에서 제외.
--      기존 verdict 덮어쓰기·삭제 금지. 다시 켤 수 있는 스위치"(남헌 v61).
--   · analysis_inputs 에 컬럼을 달지 않고 별도 표로 둔 이유: 태그 1.6만 건을 기존 원문 표에 대량 UPDATE 하지 않는다
--     (§10.2 예외 2 회피). 새 표에 INSERT 만 한다. 롤백 = 이 표 DROP 하나, 원문·판정은 그대로.
--   · review_relevance_verdicts 에 'irrelevant' 를 넣지 않는 이유: 기존 판정을 덮지 않고(insert-only 라도 빈칸에
--     가짜 판정이 생기면 2차 판정·자동 승인·평가 하네스가 그걸 모델 판정으로 읽는다), 재개 시 지울 것이 없어야 한다.
-- 쓰는 곳: scripts/consumer-material-tag.mjs(--apply 일 때만 INSERT … ON CONFLICT DO NOTHING, 사람이 실행).
-- 읽는 곳: lib/analysis/consumer-material.ts loadConsumerTagged → relevance-pending(대기열 제외) · dropIrrelevant(extract·경쟁사 프로필).
-- 재개 스위치: env RELEVANCE_SKIP_CONSUMER=off → 코드가 이 표를 읽지 않는다(행은 남는다).
-- RLS on + FORCE + 정책 0 = service_role 전용(CLAUDE.md §5-1).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.consumer_material_tags (
  input_id   uuid PRIMARY KEY REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  source_key text,
  -- 'area:out-consumer' | 'source:youtube' (lib/analysis/consumer-material.ts consumerReasonOf)
  reason     text NOT NULL CHECK (reason ~ '^(area|source):[a-z0-9_-]+$'),
  rule_ver   text NOT NULL,
  tagged_at  timestamptz NOT NULL DEFAULT now()
);

-- 대기열·extract 가 "이 프로젝트의 태그" 를 읽는 축.
CREATE INDEX IF NOT EXISTS idx_consumer_material_tags_project
  ON public.consumer_material_tags (project_id);

ALTER TABLE public.consumer_material_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumer_material_tags FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.consumer_material_tags IS
  '소비재 자료 태그(남헌 v61). 있으면 판정 대기열 제외 · 하위 사용처는 관련 없음으로 읽음(사람 채점이 이김). insert-only. service_role 전용. 20261015000010';

COMMIT;

-- ── 양성 (적용 후) ──────────────────────────────────────────────
-- SELECT c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
--   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'consumer_material_tags';   -- t · t · 0
-- SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'consumer_material_tags';  -- 6
-- ── 음성 (롤백되는 형태) ────────────────────────────────────────
-- BEGIN; INSERT INTO public.consumer_material_tags (input_id, project_id, reason, rule_ver)
--   SELECT id, project_id, 'bad reason', 'cm-v1' FROM public.analysis_inputs LIMIT 1; ROLLBACK;   -- 23514
-- BEGIN; INSERT INTO public.consumer_material_tags (input_id, project_id, reason, rule_ver)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'area:out-consumer', 'cm-v1'); ROLLBACK;        -- 23503
