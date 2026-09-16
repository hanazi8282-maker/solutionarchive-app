-- 자율 VOC 발굴 후보 대장 (신규 테이블 1개. 기존 테이블 변경 없음)
--
-- ⛔ **미적용.** CLAUDE.md §10.1 — 무인 루프·에이전트는 마이그레이션을 적용하지
--    않는다. 사람이 `supabase db query --linked -f` 또는 대시보드로 실행한다.
--    롤백은 같은 폴더의 `_rollback.sql` (DROP TABLE 한 줄).
--
-- 무엇을 담나: 발굴 루프가 낸 후보 **전부**. 채택된 것만이 아니라 기각·확인불가도
-- 남긴다. 남기지 않으면 같은 이름을 매일 다시 제안하고, "왜 이건 안 뽑혔나"에
-- 아무도 답할 수 없다.
--
-- ⚠️ research_queue 를 재사용하지 않는 이유: CMO 루프가 그 테이블을
--    `status IN ('queued','claimed')` 로만 훑고 `reason` 을 안 본다
--    (scripts/research-queue.mjs). 발굴 후보를 거기 넣으면 CMO 가 그걸
--    조사 대상으로 집어 간다.
--
-- ⚠️ verdict 는 세 값이다. `unverified`(못 알아봤다)를 `rejected`(알아봤는데
--    아니다)와 **절대 섞지 마라.** 프로브가 깨진 날 전부 rejected 로 들어가면
--    로그에는 "정상적으로 기각"만 남고 발굴이 영영 0건이 된다(CLAUDE.md §7.1).

CREATE TABLE IF NOT EXISTS public.discovery_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- physical=실물 소비재(다나와로 검증) / saas=소프트웨어(HN 으로 검증)
  -- service=무형 서비스. ⚠️ service 는 **아직 로직이 뽑지 않는다** — 검증할
  -- VOC 소스가 없어서다. 어휘만 미리 열어 둔다(lib/discovery/candidate.ts).
  kind              text NOT NULL CHECK (kind IN ('physical','saas','service')),
  name              text NOT NULL,
  category_hint     text,
  homepage_url      text,
  why               text NOT NULL,

  -- ── 실측 흔적 ────────────────────────────────────────────────
  probe_source_key  text REFERENCES public.review_sources (key),
  probe_ref         text,
  probe_hits        integer,
  probe_at          timestamptz,
  probe_note        text,

  verdict           text NOT NULL CHECK (verdict IN ('accepted','rejected','unverified')),
  verdict_reason    text NOT NULL,

  project_id        uuid REFERENCES public.analysis_projects (id) ON DELETE SET NULL,

  -- ⚠️ 적용하는 사람에게: `agent_runs` 가 실제 DB 에 있는지 먼저 확인하라.
  --      SELECT 1 FROM information_schema.tables
  --       WHERE table_schema='public' AND table_name='agent_runs';
  --    없으면 **이 컬럼 한 줄을 지우고** 적용하라. 없는 테이블을 참조하면
  --    마이그레이션 전체가 42P01 로 실패한다.
  --    (PostgREST 로 확인하지 마라 — 없는 테이블에도 204 를 준다. 이 리포에서
  --     검증기가 존재하지 않는 테이블 4개를 ✅ 로 보고한 적이 있다.)
  run_id            uuid REFERENCES public.agent_runs (id) ON DELETE SET NULL,

  -- 사람 사후 검토. 자동 채택을 사람이 뒤집는 자리다. 기본은 pending.
  human_review      text NOT NULL DEFAULT 'pending' CHECK (human_review IN ('pending','kept','killed')),

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- 실측 없이 채택될 수 없다. 이 루프의 존재 이유를 DB 가 강제한다.
  CONSTRAINT accepted_needs_probe
    CHECK (verdict <> 'accepted' OR (probe_hits IS NOT NULL AND probe_ref IS NOT NULL)),
  -- 확인 못 한 후보에 프로젝트가 붙어 있으면 둘 중 하나가 거짓말이다.
  CONSTRAINT unverified_has_no_project
    CHECK (verdict <> 'unverified' OR project_id IS NULL)
);

-- 같은 축의 같은 이름은 한 번만. 대소문자 차이는 같은 이름으로 본다
-- (lib/discovery/candidate.ts 의 nameKey 와 같은 규칙이어야 한다).
CREATE UNIQUE INDEX IF NOT EXISTS discovery_candidates_name_key
  ON public.discovery_candidates (kind, lower(name));

-- 최근 이력 조회(축 선택·다이제스트).
CREATE INDEX IF NOT EXISTS discovery_candidates_recent_idx
  ON public.discovery_candidates (created_at DESC);

-- 카테고리 포화 판정은 채택분만 센다.
CREATE INDEX IF NOT EXISTS discovery_candidates_category_idx
  ON public.discovery_candidates (category_hint)
  WHERE verdict = 'accepted';

COMMENT ON TABLE public.discovery_candidates IS
  '자율 VOC 발굴 후보 대장. LLM 이 이름을 내고 실측 프로브(hits)가 채택을 정한다. '
  '기각·확인불가도 남긴다 — 안 남기면 같은 후보를 매일 다시 제안한다.';

COMMENT ON COLUMN public.discovery_candidates.probe_ref IS
  '프로브가 찾아낸 대상 식별자(다나와 pcode / HN `q:<키워드>`). 채택되면 그대로 '
  'review_targets.product_ref 가 된다. '
  '⚠️ app/api/analyze/targets 의 "자유 텍스트로 검색해 자동 선택 금지"와 어긋나지 '
  '않는다. 그 금지는 **기존 프로젝트에 상품을 갖다 붙일 때** 유효하다. 발굴이 '
  '새로 만드는 프로젝트는 여기서 찾은 대상이 곧 그 프로젝트의 정의라 잘못 붙을 '
  '대상 자체가 없다. 기존 프로젝트에는 이 경로로도 붙이지 않는다.';

COMMENT ON COLUMN public.discovery_candidates.probe_hits IS
  '실측 VOC 건수. NULL 은 **0 이 아니라 "못 셌다"** 이고 그때 verdict 는 unverified 다.';

COMMENT ON COLUMN public.discovery_candidates.verdict IS
  'accepted=실측 통과 / rejected=알아봤는데 미달 / unverified=요청·파싱 실패(재시도 대상). '
  'unverified 를 rejected 로 접으면 프로브가 깨진 날을 아무도 모른다.';

COMMENT ON COLUMN public.discovery_candidates.human_review IS
  'pending=미검토 / kept=사람이 유지 / killed=사람이 무효화. 자동 채택을 뒤집는 자리.';

-- 정책 0개 = service_role 전용. 앱은 service_role 로만 읽는다(기존 관례).
ALTER TABLE public.discovery_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_candidates FORCE ROW LEVEL SECURITY;

-- 적용 후 확인 (양성/음성 둘 다 볼 것):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'discovery_candidates' ORDER BY ordinal_position;
--   기대: 위 컬럼 전부 (run_id 를 뺐다면 그것만 없음)
--
--   -- 음성 1: 실측 없이 채택은 거절돼야 한다
--   INSERT INTO public.discovery_candidates (kind, name, why, verdict, verdict_reason)
--     VALUES ('saas', '검증용', 'x', 'accepted', 'x');
--   기대: ERROR 23514 "accepted_needs_probe"
--
--   -- 음성 2: 어휘 밖 verdict 는 거절돼야 한다
--   INSERT INTO public.discovery_candidates (kind, name, why, verdict, verdict_reason)
--     VALUES ('saas', '검증용2', 'x', 'maybe', 'x');
--   기대: ERROR 23514 "discovery_candidates_verdict_check"
--
--   -- 음성 3: 대소문자만 다른 중복은 거절돼야 한다
--   INSERT INTO public.discovery_candidates (kind, name, why, verdict, verdict_reason)
--     VALUES ('saas', '검증용3', 'x', 'rejected', 'x'), ('saas', '검증용3 ', 'x', 'rejected', 'x');
--   기대: 두 번째가 ERROR 23505 (앞뒤 공백은 애플리케이션이 정규화한다)
--
--   -- 뒷정리
--   DELETE FROM public.discovery_candidates WHERE name LIKE '검증용%';
