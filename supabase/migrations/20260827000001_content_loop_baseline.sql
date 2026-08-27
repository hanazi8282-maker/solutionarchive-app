-- ============================================================
-- 콘텐츠 루프 스키마 베이스라인 (channels / content_items / hypotheses /
--   posts / metric_snapshots / benchmarks / learnings + post_performance 뷰)
--
-- 배경: 이 7개 테이블·뷰·트리거는 Supabase 대시보드에서 직접 만들어졌고
--   DDL 이 레포에 없다. 그 결과 (1) 새 환경을 이 레포만으로 재현할 수 없고
--   (2) 컬럼·제약이 언제 어떤 의도로 생겼는지 코드 리뷰로 추적할 수 없다.
--   이 파일은 그 드리프트를 메우는 "현재 상태 캡처"다. 새 기능이 아니다.
--
-- ⚠️ 이 마이그레이션은 운영 DB(qmgrfqjfxqhxuufrnkwf)에서는 사실상 no-op 이다.
--   모든 객체가 이미 존재하므로 IF NOT EXISTS / OR REPLACE 가 전부 건너뛴다.
--   의도된 동작이다 — 목적은 "만드는 것"이 아니라 "레포와 DB 를 일치시키는 것".
--   실제로 객체를 만드는 건 신규 환경(로컬·프리뷰 브랜치)뿐이다.
--
-- 캡처 출처: 2026-08-27 운영 DB introspection
--   pg_constraint / pg_indexes / pg_get_viewdef / pg_get_triggerdef /
--   pg_get_functiondef / pg_description, 컬럼 타입·default 는 PostgREST OpenAPI.
--   제약·인덱스 이름을 실제와 한 글자도 다르지 않게 맞췄다 — 이름이 어긋나면
--   다음 마이그레이션에서 DROP CONSTRAINT 가 빗나가고, 그때는 이 파일을
--   믿을 수 없게 된다.
--
-- 생성 순서는 FK 의존성 순이다. 바꾸지 말 것:
--   channels → content_items → hypotheses → posts → metric_snapshots
--   → benchmarks → learnings
--   (posts 가 content_items.code / hypotheses.code 를 참조하므로 UNIQUE 가 먼저
--    있어야 하고, metric_snapshots 가 posts.id 를 참조한다.)
--
-- 가역: 동명 rollback 파일 참조(20260827000001_content_loop_baseline_rollback.sql).
--   ⚠️ 롤백은 시드 데이터까지 지운다. 파일 상단 경고를 반드시 읽을 것.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) channels — 발행 채널. self=자사, client=셀러 계정
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channels (
  id          uuid        NOT NULL DEFAULT gen_random_uuid()
                          CONSTRAINT channels_pkey PRIMARY KEY,
  platform    text        NOT NULL,
  handle      text,
  external_id text,
  owner_type  text        NOT NULL DEFAULT 'self',
  created_at  timestamptz DEFAULT now(),

  CONSTRAINT channels_platform_check
    CHECK ((platform = ANY (ARRAY['threads'::text, 'instagram'::text, 'blog'::text, 'meta_ads'::text, 'detail_page'::text]))),
  CONSTRAINT channels_owner_type_check
    CHECK ((owner_type = ANY (ARRAY['self'::text, 'client'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 2) content_items — 소재은행. code 가 posts 에서 참조하는 자연키다
--    (그래서 UNIQUE 가 장식이 아니라 FK 의 대상이다).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_items (
  id                uuid        NOT NULL DEFAULT gen_random_uuid()
                                CONSTRAINT content_items_pkey PRIMARY KEY,
  code              text        NOT NULL
                                CONSTRAINT content_items_code_key UNIQUE,
  tier              integer     NOT NULL,
  title             text        NOT NULL,
  twist_line        text,
  source_case       text,
  suggested_pattern integer,
  status            text        DEFAULT 'available',
  created_at        timestamptz DEFAULT now(),

  CONSTRAINT content_items_status_check
    CHECK ((status = ANY (ARRAY['available'::text, 'used'::text, 'retired'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 3) hypotheses — "이 글이 무엇을 테스트하는가". variable 이 실험 차원이다
--    (hook_type / pattern / self_reply / chain_position / closing_type /
--     published_at / chain). code 가 posts·learnings 의 FK 대상.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hypotheses (
  id            uuid        NOT NULL DEFAULT gen_random_uuid()
                            CONSTRAINT hypotheses_pkey PRIMARY KEY,
  code          text        NOT NULL
                            CONSTRAINT hypotheses_code_key UNIQUE,
  statement     text        NOT NULL,
  variable      text        NOT NULL,
  controls      text,
  status        text        DEFAULT 'testing',
  support_count integer     DEFAULT 0,
  reject_count  integer     DEFAULT 0,
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT hypotheses_status_check
    CHECK ((status = ANY (ARRAY['testing'::text, 'supported'::text, 'rejected'::text, 'inconclusive'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 4) posts — 발행된 글 1건 = 1행.
--    external_id 는 Threads API 의 게시물 id. UNIQUE 지만 nullable 이라
--    (Postgres 는 UNIQUE 에서 NULL 을 서로 구별한다) 아직 id 가 없는 행이
--    여러 개 공존할 수 있다. 후속 마이그레이션 20260827000002 가 이 성질을
--    이용해 초안(draft)을 별도 테이블 없이 이 테이블에 담는다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid()
                              CONSTRAINT posts_pkey PRIMARY KEY,
  channel_id      uuid,
  external_id     text        CONSTRAINT posts_external_id_key UNIQUE,
  published_at    timestamptz NOT NULL,
  body            text        NOT NULL,
  char_count      integer,
  content_code    text,
  pattern         integer,
  hook_type       text,
  closing_type    text,
  topic_tag       text,
  hypothesis_code text,
  chain_id        uuid,
  chain_position  integer,
  self_reply_at   timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT posts_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES public.channels(id),
  CONSTRAINT posts_content_code_fkey
    FOREIGN KEY (content_code) REFERENCES public.content_items(code),
  CONSTRAINT posts_hypothesis_code_fkey
    FOREIGN KEY (hypothesis_code) REFERENCES public.hypotheses(code)
);

-- 제약이 만들어주지 않는 인덱스 3건.
-- (나머지 11건은 PK/UNIQUE 제약이 자동 생성하므로 여기서 다시 만들지 않는다.
--  중복 생성하면 같은 컬럼에 인덱스가 두 벌 생겨 쓰기 비용만 늘어난다.)
CREATE INDEX IF NOT EXISTS posts_published_at_idx
  ON public.posts USING btree (published_at DESC);
CREATE INDEX IF NOT EXISTS posts_hypothesis_code_idx
  ON public.posts USING btree (hypothesis_code);
CREATE INDEX IF NOT EXISTS posts_pattern_hook_type_idx
  ON public.posts USING btree (pattern, hook_type);


-- ────────────────────────────────────────────────────────────
-- 5) metric_snapshots — 같은 글을 여러 "나이"에서 재측정한 기록.
--
--    ⚠️ UNIQUE 가 (post_id, captured_at) 이 아니라 (post_id, hours_since_publish) 다.
--    즉 원설계 의도는 "임의 시각마다 한 번"이 아니라 "정해진 나이 버킷마다 한 번"이다.
--    수집기가 실제 경과시간(18.3h 같은 값)을 그대로 넣으면 이 제약이 무력화되므로,
--    수집 시 1 / 24 / 168 로 정규화해서 저장해야 한다.
--    post_performance 뷰가 보는 창도 이 값 기준이다(<=1.5, 20~30).
--
--    post_id 는 ON DELETE CASCADE — 글을 지우면 그 글의 측정치도 함께 사라진다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metric_snapshots (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid()
                                  CONSTRAINT metric_snapshots_pkey PRIMARY KEY,
  post_id             uuid,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  hours_since_publish numeric     NOT NULL,
  views               integer,
  likes               integer,
  replies             integer,
  reposts             integer,
  quotes              integer,
  shares              integer,
  profile_clicks      integer,
  follows             integer,
  source              text        NOT NULL DEFAULT 'api',
  created_at          timestamptz DEFAULT now(),

  CONSTRAINT metric_snapshots_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE,
  CONSTRAINT metric_snapshots_post_id_hours_since_publish_key
    UNIQUE (post_id, hours_since_publish),
  CONSTRAINT metric_snapshots_source_check
    CHECK ((source = ANY (ARRAY['api'::text, 'manual'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 6) benchmarks — 채널·지표별 분포. mode 가 표본 수에 따라 해석을 바꾼다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmarks (
  id          uuid        NOT NULL DEFAULT gen_random_uuid()
                          CONSTRAINT benchmarks_pkey PRIMARY KEY,
  channel_id  uuid,
  metric      text        NOT NULL,
  p25         numeric,
  median      numeric,
  p75         numeric,
  sample_size integer     NOT NULL,
  mode        text        NOT NULL,
  computed_at timestamptz DEFAULT now(),

  CONSTRAINT benchmarks_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES public.channels(id),
  CONSTRAINT benchmarks_mode_check
    CHECK ((mode = ANY (ARRAY['absolute_provisional'::text, 'quantile'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 7) learnings — 가설에서 승격된 학습. 아래 트리거가 표본 부족 확정을 막는다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learnings (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid()
                                 CONSTRAINT learnings_pkey PRIMARY KEY,
  channel_id         uuid,
  statement          text        NOT NULL,
  hypothesis_code    text,
  status             text        NOT NULL DEFAULT 'candidate',
  sample_size        integer     NOT NULL DEFAULT 0,
  conflicts_external boolean     DEFAULT false,
  external_claim     text,
  promoted_at        timestamptz,
  created_at         timestamptz DEFAULT now(),

  CONSTRAINT learnings_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES public.channels(id),
  CONSTRAINT learnings_hypothesis_code_fkey
    FOREIGN KEY (hypothesis_code) REFERENCES public.hypotheses(code),
  CONSTRAINT learnings_status_check
    CHECK ((status = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'rejected'::text])))
);


-- ────────────────────────────────────────────────────────────
-- 8) 학습 승격 가드
--
--    표본 5개 미만으로 'confirmed' 를 만들 수 없게 막는다. 애플리케이션이 아니라
--    DB 에 두는 이유: 승격 경로가 앞으로 여러 개(스크립트·라우트·수기 SQL)가 되는데
--    한 곳에서만 검사하면 나머지 경로가 조용히 규칙을 우회한다.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_learning_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'confirmed' and new.sample_size < 5 then
    raise exception '표본 % 개로는 확정 불가. 최소 5개 필요.', new.sample_size;
  end if;
  return new;
end;
$function$;

-- CREATE OR REPLACE TRIGGER 는 PostgreSQL 14+ 문법이다(Supabase 는 15 이상).
-- DROP 후 CREATE 로 쓰지 않는 이유: 두 문장 사이에 가드가 잠깐 사라지는 창이 생긴다.
CREATE OR REPLACE TRIGGER trg_guard_learning
  BEFORE INSERT OR UPDATE ON public.learnings
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_promotion();


-- ────────────────────────────────────────────────────────────
-- 9) post_performance — 나이 버킷별 측정치를 글 1행으로 피벗한 분석 뷰
--
--    ⚠️ 이 뷰가 보는 창은 딱 두 개다:
--        1h  버킷 → hours_since_publish <= 1.5
--        24h 버킷 → hours_since_publish BETWEEN 20 AND 30
--    168h 는 원시 지표로만 쓰이고 이 뷰에는 나타나지 않는다.
--    그 사이(예: 72h)에 저장된 스냅샷은 이 뷰에서 완전히 무시된다 — 수집기가
--    버킷을 늘리려면 이 뷰를 함께 고쳐야 한다.
--
--    spread_multiple = views_24h / views_1h 이므로 1h 스냅샷이 없으면
--    이 지표가 항상 NULL 이고 H3(자답글이 확산배수를 올린다)을 검증할 수 없다.
--    1h 수집은 선택이 아니라 필수다.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.post_performance AS
 SELECT p.id,
    p.published_at,
    p.content_code,
    p.pattern,
    p.hook_type,
    p.closing_type,
    p.hypothesis_code,
    p.self_reply_at IS NOT NULL AS had_self_reply,
    max(s.views) FILTER (WHERE s.hours_since_publish <= 1.5) AS views_1h,
    max(s.replies) FILTER (WHERE s.hours_since_publish <= 1.5) AS replies_1h,
    max(s.views) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric) AS views_24h,
    max(s.replies) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric) AS replies_24h,
    max(s.likes) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric) AS likes_24h,
    max(s.profile_clicks) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric) AS profile_clicks_24h,
    max(s.follows) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric) AS follows_24h,
    round(max(s.replies) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric)::numeric / NULLIF(max(s.views) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric), 0)::numeric, 5) AS reply_rate,
    round(max(s.views) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric)::numeric / NULLIF(max(s.views) FILTER (WHERE s.hours_since_publish <= 1.5), 0)::numeric, 2) AS spread_multiple,
    round(max(s.replies) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric)::numeric / NULLIF(max(s.likes) FILTER (WHERE s.hours_since_publish >= 20::numeric AND s.hours_since_publish <= 30::numeric), 0)::numeric, 3) AS reply_to_like
   FROM posts p
     LEFT JOIN metric_snapshots s ON s.post_id = p.id
  GROUP BY p.id;


-- ────────────────────────────────────────────────────────────
-- 10) RLS: 켜되 정책 없음 = service_role 전용
--
--    이 앱은 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 브라우저에 노출한다. 정책을
--    하나라도 추가하면 콘텐츠 전략(소재은행·가설·성과)이 그대로 공개된다.
--    정책 추가 금지. 서버 라우트·크론·대시보드 서버액션은 전부 service_role 로
--    붙으므로(BYPASSRLS) 정책 없이도 정상 동작한다.
--
--    ⚠️ FORCE 는 일부러 걸지 않는다 — api_tokens 와 다른 선택이다.
--       막으려는 위협은 "브라우저에 노출된 anon 키"이고, 그건 ENABLE + 정책 0개로
--       이미 완전히 차단된다(2026-08-27 anon 키 실측: 행이 있는 테이블에서도 0행).
--       FORCE 가 추가로 막는 대상은 테이블 소유자, 즉 대시보드를 쓰는 사람뿐이다.
--       api_tokens 는 자격증명이라 소유자도 평문으로 볼 이유가 없어 FORCE 가 옳았지만,
--       여기 7개는 사람이 손으로 관리하는 운영 데이터다(소재 상태 변경, 가설 추가,
--       시드 점검). posts.body 는 어차피 공개 발행될 글이라 비밀도 아니다.
--       이 테이블들에 FORCE 를 걸면 보안 이득은 0이고 대시보드 편집만 막힌다.
--
--       api_tokens 의 FORCE 는 이 마이그레이션 범위 밖이며 그대로 유지된다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hypotheses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learnings        ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- 11) 컬럼 의미 주석 — 운영 DB 에 실재하는 2건만 캡처한다.
--     새 주석을 여기서 추가하지 않는 이유: 이 파일의 목적이 "DB 와 일치"라서
--     레포에만 있는 주석을 넣으면 반대 방향의 드리프트가 생긴다.
-- ────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.benchmarks.mode IS
  'sample_size < 20 이면 absolute_provisional(잠정 절대값), 이상이면 quantile로 자동 전환. '
  '로직 v2 결함 B(고정 임계값이 저관여 카테고리를 무출력시킴)와 같은 실수를 여기서 반복하지 않기 위한 장치.';
COMMENT ON COLUMN public.channels.owner_type IS
  'self=솔루션아카이브 계정(빌드인퍼블릭), client=셀러 계정. 나중에 멀티테넌트 전환 지점';


-- ============================================================
-- 적용 후 확인용 (레포 루트의 verify_schema.sql 과 같은 목적, 제약·인덱스까지 확인)
--
--   SELECT conrelid::regclass::text AS tbl, conname
--     FROM pg_constraint
--    WHERE connamespace = 'public'::regnamespace
--      AND conrelid::regclass::text IN ('channels','content_items','hypotheses',
--            'posts','metric_snapshots','benchmarks','learnings')
--    ORDER BY 1, 2;   -- 25건이어야 한다
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename IN ('channels','content_items','hypotheses','posts',
--            'metric_snapshots','benchmarks','learnings')
--    ORDER BY 1;      -- 14건이어야 한다
-- ============================================================
