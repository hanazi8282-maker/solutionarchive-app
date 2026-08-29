-- ============================================================
-- 리뷰 수집 계층 — 소스 레지스트리 / 타깃·커서 / 실행 이력 / 중복 지문
--
-- 설계 전문: docs/review-collection-design.md
-- 실측 근거: docs/review-source-findings.md  (소스는 다나와 하나다)
--
-- ⛔ 적용은 사용자가 대시보드에서 직접 한다(CLAUDE.md §10). 이 파일은 SQL 만 담는다.
--
-- 이 마이그레이션이 푸는 문제: 경쟁사 분석 프로젝트 12개가
-- status='collecting', analysis_inputs 0건인 채로 서 있다. 사람이 리뷰를
-- 손으로 붙여넣어야 다음이 돌아가는 구조라 거기서 멈췄다(인수인계 §8 Day2).
-- 수집기가 analysis_inputs 를 채우는 순간 그 병목이 풀린다.
--
-- ⚠️ 파괴적 변경이 하나 있다: analysis_inputs.raw_text 의 NOT NULL 을 푼다.
--    사유는 §5 에 적었다. 되돌리려면 rollback 파일을 볼 것 — 단, 그때는
--    이미 null 인 행이 있으면 되돌릴 수 없다(그것도 rollback 파일에 적었다).
--
-- 가역: 동명 rollback 파일 참조(20260829000003_review_collection_rollback.sql).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) review_sources — 소스 레지스트리 + 즉시 중단 스위치
--
--    이 테이블의 존재 이유는 레지스트리가 아니라 **중단 스위치**다.
--    쓸 만한 소스가 다나와 하나뿐이라, 그 하나가 차단되거나 구조를 바꿨을 때
--    "지금 당장 멈추는 방법"이 코드 배포여서는 안 된다. 대시보드에서
--      UPDATE review_sources SET enabled = false, disabled_reason = '...'
--    한 줄이면 다음 실행부터 그 소스를 건드리지 않는다.
--
--    min_interval_ms / daily_request_cap 을 코드가 아니라 DB 에 두는 것도
--    같은 이유다. 상대 서버가 느려졌을 때 배포 없이 조일 수 있어야 한다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_sources (
  key               text        NOT NULL
                                CONSTRAINT review_sources_pkey PRIMARY KEY,
  display_name      text        NOT NULL,

  enabled           boolean     NOT NULL DEFAULT true,
  disabled_reason   text,
  disabled_at       timestamptz,

  -- 건강도. lib/review/health.ts 가 매 실행 뒤 갱신한다.
  health            text        NOT NULL DEFAULT 'ok',
  health_detail     text,
  health_checked_at timestamptz,

  min_interval_ms   integer     NOT NULL DEFAULT 4000,
  daily_request_cap integer     NOT NULL DEFAULT 200,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT review_sources_health_check
    CHECK (health = ANY (ARRAY['ok'::text, 'degraded'::text, 'broken'::text])),

  -- 간격을 0 이나 음수로 두면 상대 서버를 쉬지 않고 때린다. DB 가 막는다.
  CONSTRAINT review_sources_min_interval_check
    CHECK (min_interval_ms >= 1000),
  CONSTRAINT review_sources_daily_cap_check
    CHECK (daily_request_cap > 0),

  -- 껐으면 왜 껐는지가 반드시 있어야 한다. 이유 없는 비활성은
  -- 몇 주 뒤에 "이거 왜 꺼져 있지"로 돌아오고, 그때 누가 다시 켠다.
  CONSTRAINT review_sources_disabled_needs_reason
    CHECK (enabled OR disabled_reason IS NOT NULL)
);

COMMENT ON TABLE public.review_sources IS
  '리뷰 수집 소스 레지스트리. enabled=false 로 바꾸면 다음 실행부터 그 소스를 건드리지 않는다 — 코드 배포 없는 즉시 중단 경로다.';
COMMENT ON COLUMN public.review_sources.health IS
  'ok / degraded(연속 3회 신규 0건) / broken(파싱 성공률 0.8 미만 또는 403·429). broken 은 자동으로 enabled=false 를 동반한다.';
COMMENT ON COLUMN public.review_sources.min_interval_ms IS
  '같은 소스 연속 요청 사이 최소 간격. 코드가 아니라 DB 에 두어 배포 없이 조일 수 있게 한다. 1000 미만 금지.';
COMMENT ON COLUMN public.review_sources.disabled_reason IS
  '왜 껐는지. 제약으로 강제한다 — 이유 없는 비활성은 나중에 누가 아무 근거 없이 다시 켠다.';


-- ────────────────────────────────────────────────────────────
-- 2) review_targets — 수집 대상 + 체크포인트
--
--    ⚠️ 체크포인트를 실행(run)이 아니라 **타깃**에 둔다. 페이지 하나를
--    처리할 때마다 cursor 를 즉시 갱신하므로, Actions 잡이 SIGKILL 로 죽어도
--    다음 실행이 각 타깃의 cursor 에서 그냥 이어간다.
--
--    run 에 두면 "어디까지 했는지"를 실행 로그에서 복원해야 하고, 그 복원
--    코드가 곧 버그가 된다. 죽는 방식이 여러 가지라(타임아웃·OOM·러너 회수)
--    복원 경로를 전부 테스트할 수도 없다.
--
--    product_ref 는 다나와 pcode 다. 어느 상품을 어느 프로젝트에 붙일지는
--    도메인 판단이라 사람이 정한다 — 탈모샴푸 검색에 165개가 잡히는데
--    그중 어느 것이 "라보에이치 경쟁 분석"의 대상인지는 자동으로 못 고른다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_targets (
  id                uuid        NOT NULL DEFAULT gen_random_uuid()
                                CONSTRAINT review_targets_pkey PRIMARY KEY,
  project_id        uuid        NOT NULL,
  source_key        text        NOT NULL,
  product_ref       text        NOT NULL,
  label             text,

  -- 다음에 이어갈 위치. 다나와는 페이지 번호(text 로 두어 소스마다
  -- 다른 커서 형태를 담을 수 있게 한다 — 토큰형 커서를 쓰는 소스도 있다).
  cursor            text,

  -- 증분 기준. 이보다 오래된 리뷰를 연속 5개 만나면 그 실행에서 종료한다.
  -- "페이지 끝"이 아니라 이 조건을 쓰는 이유: 정렬이 흔들리면 페이지 경계가
  -- 밀려 일부를 건너뛴다. 한두 개가 순서에서 튀어도 조기 종료하지 않는다.
  last_review_at    date,

  status            text        NOT NULL DEFAULT 'active',
  consecutive_empty integer     NOT NULL DEFAULT 0,

  last_run_at       timestamptz,
  total_collected   integer     NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT review_targets_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  CONSTRAINT review_targets_source_key_fkey
    FOREIGN KEY (source_key) REFERENCES public.review_sources(key),
  CONSTRAINT review_targets_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'exhausted'::text, 'failed'::text])),

  -- 같은 프로젝트에 같은 상품을 두 번 매달면 리뷰가 두 번 수집되고
  -- 같은 불만이 두 번 세어진다. 지문이 잡아주긴 하지만 요청부터 낭비다.
  CONSTRAINT review_targets_project_source_product_key
    UNIQUE (project_id, source_key, product_ref)
);

-- 러너가 매 실행 "지금 돌릴 타깃"을 훑는다. 오래 안 돈 것부터.
CREATE INDEX IF NOT EXISTS review_targets_due_idx
  ON public.review_targets (source_key, last_run_at NULLS FIRST)
  WHERE status = 'active';

COMMENT ON TABLE public.review_targets IS
  '수집 대상 1건 = 1행. cursor 가 체크포인트다 — 페이지마다 즉시 갱신하므로 잡이 죽어도 다음 실행이 그대로 이어간다.';
COMMENT ON COLUMN public.review_targets.cursor IS
  '다음에 이어갈 위치. 다나와는 페이지 번호. text 인 이유는 소스마다 커서 형태가 다르기 때문(토큰형도 있다).';
COMMENT ON COLUMN public.review_targets.last_review_at IS
  '증분 기준. 이보다 오래된 리뷰를 연속 5개 만나면 그 실행에서 이 타깃을 종료한다. 정렬 변동에 견디게 하려는 조건이다.';
COMMENT ON COLUMN public.review_targets.consecutive_empty IS
  '연속 신규 0건 횟수. 3 이상이면 소스 건강도가 degraded 로 떨어진다.';


-- ────────────────────────────────────────────────────────────
-- 3) review_collection_runs — 실행 이력 + 건강도 판정 입력
--
--    조용한 실패를 막는 게 목적이다. 소스가 하나뿐이라 "안 되는데 되는 척"이
--    가장 비싼 고장이고, 2주 뒤에 발견하면 그 2주치 분석이 전부 빈 표 위에서
--    돌아간 것이 된다.
--
--    reviews_parsed 와 parse_failures 를 따로 세는 게 핵심이다.
--    "0건 파싱"과 "10건 보이는데 0건 파싱"은 완전히 다른 사건인데,
--    합쳐 세면 둘이 똑같이 보인다. 후자가 구조 변경 신호다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_collection_runs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid()
                              CONSTRAINT review_collection_runs_pkey PRIMARY KEY,
  source_key      text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  trigger         text        NOT NULL DEFAULT 'cron',
  dry_run         boolean     NOT NULL DEFAULT false,

  -- running 으로 남은 행은 다음 실행이 interrupted 로 정리한다.
  -- 잡이 SIGKILL 로 죽으면 finished_at 을 못 쓰는데, 그걸 성공으로
  -- 착각하면 안 된다.
  status          text        NOT NULL DEFAULT 'running',

  targets_visited integer     NOT NULL DEFAULT 0,
  requests        integer     NOT NULL DEFAULT 0,
  pages_fetched   integer     NOT NULL DEFAULT 0,
  reviews_parsed  integer     NOT NULL DEFAULT 0,
  parse_failures  integer     NOT NULL DEFAULT 0,
  new_reviews     integer     NOT NULL DEFAULT 0,
  duplicates      integer     NOT NULL DEFAULT 0,
  revisions       integer     NOT NULL DEFAULT 0,
  robots_skips    integer     NOT NULL DEFAULT 0,

  health_after    text,
  error           text,

  CONSTRAINT review_collection_runs_source_key_fkey
    FOREIGN KEY (source_key) REFERENCES public.review_sources(key),
  CONSTRAINT review_collection_runs_status_check
    CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'failed'::text, 'interrupted'::text])),
  CONSTRAINT review_collection_runs_trigger_check
    CHECK (trigger = ANY (ARRAY['cron'::text, 'manual'::text]))
);

CREATE INDEX IF NOT EXISTS review_collection_runs_recent_idx
  ON public.review_collection_runs (source_key, started_at DESC);

COMMENT ON TABLE public.review_collection_runs IS
  '수집 실행 1회 = 1행. 조용한 실패를 막는 장치다 — 소스가 하나뿐이라 안 되는 걸 늦게 아는 게 가장 비싸다.';
COMMENT ON COLUMN public.review_collection_runs.parse_failures IS
  '리뷰 항목은 보이는데 필드를 못 읽은 수. reviews_parsed 와 합쳐 세면 "0건 파싱"과 "10건 보이는데 0건" 이 구분되지 않는다 — 후자가 구조 변경 신호다.';
COMMENT ON COLUMN public.review_collection_runs.status IS
  'running 으로 남은 행은 다음 실행이 interrupted 로 정리한다. 잡이 죽으면 finished_at 을 못 쓰므로 그걸 성공으로 읽으면 안 된다.';


-- ────────────────────────────────────────────────────────────
-- 4) review_fingerprints — 중복 제거. 원문을 지운 뒤에도 남는다
--
--    ⚠️⚠️ 이 테이블이 원문 삭제와 증분 수집의 충돌을 푸는 유일한 장치다.
--
--    원문(analysis_inputs.raw_text)은 30일 뒤 비운다. 그러면 "이미 본
--    리뷰"를 판별할 근거가 사라진다. 해결은 하나뿐이다 — 지문을 원문에서
--    파생시키되 **지문이 원문에 의존하지 않게** 만드는 것. 한 번 계산해
--    저장하면 원문이 없어도 비교가 된다. 그래서 원문 30일 / 지문 무기한이다.
--
--    ── 키가 두 개인 이유 ──
--
--    identity_key : "같은 리뷰인가" 판별용. UNIQUE 대상.
--    content_hash : "내용이 바뀌었는가" 감지용. 제약이 아니라 관측값.
--
--    하나로는 안 된다.
--      본문만 해싱  → "가벼운데 성능도 만족합니다!" 같은 짧고 흔한 리뷰가
--                     충돌해 서로 다른 사람의 글을 중복으로 버린다.
--      본문 포함 해싱 → 리뷰가 수정되면 다른 지문이 되어 중복 적재된다.
--
--    둘 중 중복 적재가 훨씬 비싸다. 이 파이프라인의 산출물이 속성별
--    importance 인데, 같은 리뷰가 두 번 들어가면 그 불만이 두 번 세어져
--    중요도가 부풀려진다. 조용히 왜곡되고 나중에 추적이 안 된다.
--    그래서 정체성과 내용을 분리했다.
--
--    identity_key = sha256("danawa" | product_ref | review_seq)
--      다나와가 리뷰별 고유 seq 를 노출한다(2026-08-29 실측 확인):
--        id="danawa-prodBlog-companyReview-button-side-252495223"
--      prodCode=102126566&page=1 에서 항목 3개 / 고유 seq 3개로 1:1 대응.
--      seq 형식이 섞여 있어(9자리 vs 11자리 0패딩) 판매처별 ID 공간이
--      그대로 실려 오는 듯하므로, 상품으로 범위를 좁혀 쓴다.
--
--    폴백(seq 가 사라지면):
--      sha256("danawa" | product_ref | seller | author_masked | written_at)
--      본문을 넣지 않아 수정에 견딘다. 대신 같은 사람이 같은 날 같은
--      판매처에서 같은 상품에 두 번 쓰면 두 번째를 잃는다. key_kind 로
--      폴백 비율을 추적한다 — 절반을 넘으면 구조가 바뀐 것이다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_fingerprints (
  id                uuid        NOT NULL DEFAULT gen_random_uuid()
                                CONSTRAINT review_fingerprints_pkey PRIMARY KEY,
  source_key        text        NOT NULL,
  identity_key      text        NOT NULL,
  content_hash      text        NOT NULL,
  key_kind          text        NOT NULL DEFAULT 'seq',

  product_ref       text,
  written_at        date,

  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  revision_count    integer     NOT NULL DEFAULT 0,

  -- ⚠️ ON DELETE SET NULL 이 핵심이다. analysis_inputs 는 analysis_projects 에
  --    ON DELETE CASCADE 로 매달려 있다. 프로젝트를 지울 때 지문까지 딸려
  --    죽으면, 프로젝트를 다시 만들었을 때 이미 본 리뷰를 전부 다시 긁는다.
  analysis_input_id uuid,

  CONSTRAINT review_fingerprints_source_key_fkey
    FOREIGN KEY (source_key) REFERENCES public.review_sources(key),
  CONSTRAINT review_fingerprints_analysis_input_id_fkey
    FOREIGN KEY (analysis_input_id) REFERENCES public.analysis_inputs(id) ON DELETE SET NULL,
  CONSTRAINT review_fingerprints_key_kind_check
    CHECK (key_kind = ANY (ARRAY['seq'::text, 'composite'::text])),

  -- 중복 판정 본체. 조회 후 삽입이 아니라 **삽입 시도가 곧 중복 검사**다.
  -- 동시 실행에서도 안전하다.
  CONSTRAINT review_fingerprints_source_identity_key
    UNIQUE (source_key, identity_key)
);

-- 증분 종료 판정이 타깃별 최신 리뷰 날짜를 본다.
CREATE INDEX IF NOT EXISTS review_fingerprints_target_recent_idx
  ON public.review_fingerprints (source_key, product_ref, written_at DESC);

-- 원문 폐기 배치가 역방향으로 찾는다.
CREATE INDEX IF NOT EXISTS review_fingerprints_input_idx
  ON public.review_fingerprints (analysis_input_id)
  WHERE analysis_input_id IS NOT NULL;

COMMENT ON TABLE public.review_fingerprints IS
  '중복 제거 지문. 보관 무기한 — 지우면 증분 수집이 무너진다. 원문이 폐기돼도 이 행은 남아 "이미 본 리뷰"를 계속 판별한다.';
COMMENT ON COLUMN public.review_fingerprints.identity_key IS
  '"같은 리뷰인가" 판별용 sha256. 본문을 넣지 않는다 — 리뷰가 수정돼도 같은 리뷰로 인식하기 위해서다.';
COMMENT ON COLUMN public.review_fingerprints.content_hash IS
  '"내용이 바뀌었는가" 감지용. 제약이 아니라 관측값이다 — 아무것도 막지 않고 아무것도 트리거하지 않는다.';
COMMENT ON COLUMN public.review_fingerprints.revision_count IS
  '수정 감지 횟수. 감지만 하고 재적재·재분석을 하지 않는다(설계 §4.5). 잦으면 사람이 재분석 여부를 판단할 신호다.';
COMMENT ON COLUMN public.review_fingerprints.key_kind IS
  'seq: 다나와 리뷰 고유번호 사용 / composite: 폴백 조합. composite 비율이 높아지면 소스 구조가 바뀐 것이다.';


-- RLS: 정책 없이 활성화만 = service_role 전용. 기존 테이블들과 같은 방침이다.
ALTER TABLE public.review_sources          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_targets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_collection_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_fingerprints     ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.review_sources          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.review_targets          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.review_collection_runs  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.review_fingerprints     FORCE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 5) analysis_inputs 확장 — 출처 구분 + 원문 폐기 가능하게
--
--    ⚠️ raw_text 의 NOT NULL 을 푼다. 이게 이 마이그레이션의 유일한
--    파괴적 변경이다.
--
--    설계상 수집분의 원문은 30일 뒤 비운다(Supabase 무료 500MB, 그리고
--    파생값이 analysis_aspects 와 llm_* 에 이미 들어가 있어 원본 가치가
--    급락한다). 행은 남긴다 — 몇 건을 언제 어디서 받았는지는 계속 필요하다.
--
--    빈 문자열로 대체하는 방법도 있지만 쓰지 않는다. 그러면 "원문이 없다"와
--    "원문이 빈 문자열이다"를 구분할 수 없고, length(raw_text)=0 같은 조건이
--    두 경우를 뭉갠다.
--
--    ⛔ 사람이 붙여넣은 행(source_key IS NULL)은 폐기 대상이 아니다.
--       다시 구할 수 없는 데이터다. 폐기 배치가 source_key IS NOT NULL 로
--       범위를 좁힌다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_inputs
  ADD COLUMN IF NOT EXISTS source_key   text,
  ADD COLUMN IF NOT EXISTS collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS purged_at    timestamptz;

ALTER TABLE public.analysis_inputs
  ALTER COLUMN raw_text DROP NOT NULL;

ALTER TABLE public.analysis_inputs
  DROP CONSTRAINT IF EXISTS analysis_inputs_source_key_fkey;
ALTER TABLE public.analysis_inputs
  ADD CONSTRAINT analysis_inputs_source_key_fkey
    FOREIGN KEY (source_key) REFERENCES public.review_sources(key);

-- 원문이 비워졌다면 언제 비웠는지가 있어야 한다. 없으면 "아직 안 받은
-- 것"과 "받았다가 폐기한 것"을 구분할 수 없다.
ALTER TABLE public.analysis_inputs
  DROP CONSTRAINT IF EXISTS analysis_inputs_purge_trace_check;
ALTER TABLE public.analysis_inputs
  ADD CONSTRAINT analysis_inputs_purge_trace_check
    CHECK (raw_text IS NOT NULL OR purged_at IS NOT NULL);

-- 폐기 배치가 훑는 경로.
CREATE INDEX IF NOT EXISTS analysis_inputs_purgeable_idx
  ON public.analysis_inputs (collected_at)
  WHERE source_key IS NOT NULL AND raw_text IS NOT NULL;

COMMENT ON COLUMN public.analysis_inputs.source_key IS
  'null = 사람이 붙여넣은 원문(폐기하지 않는다. 다시 구할 수 없다). 값이 있으면 수집기가 넣은 것 — 30일 뒤 raw_text 를 비운다.';
COMMENT ON COLUMN public.analysis_inputs.purged_at IS
  '원문을 비운 시각. 이게 없으면 "아직 안 받은 것"과 "받았다가 폐기한 것"이 구분되지 않는다.';


-- ────────────────────────────────────────────────────────────
-- 6) 시드 — 다나와 1행
--
--    실측 결과 쓸 만한 소스가 이것 하나다(docs/review-source-findings.md).
--    화해는 robots 가 리뷰 경로를 전부 금지하고, 글로우픽은 CSR 이며
--    AI 크롤러를 명시적으로 막는다. 쿠팡·11번가·무신사 등은 robots 금지
--    또는 봇 차단이다.
--
--    min_interval_ms=4000 은 프로브에서 실제로 쓴 값이다. 상대 서버가
--    한 번도 느려지지 않았지만, 판정에 속도가 필요한 일이 아니다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.review_sources (key, display_name, min_interval_ms, daily_request_cap)
VALUES ('danawa', '다나와 판매처 리뷰', 4000, 200)
ON CONFLICT (key) DO NOTHING;
