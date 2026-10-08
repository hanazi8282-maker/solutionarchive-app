-- ============================================================
-- 20261009000010_analysis_projects_area
--
-- v37 작업 1 · 소급 영역 부여(남헌 v38 승인). 드라이런: reports/2026-10-09/area-backfill-dryrun.md
--
-- 무엇을: analysis_projects 에 영역 열 5개(전부 NULL 허용)를 더하고, 규칙 v37-1 로 **area_code 가 NULL 인 행만** 채운다.
--   입력 단위 영역은 읽기 뷰 public.v_input_area(security_invoker) 로 본다 — analysis_inputs 에는 쓰지 않는다.
--   review_targets.label(원라벨)·analysis_projects 기존 열·analysis_inputs 는 건드리지 않는다(끝의 DO 가 해시로 확인).
--
-- 영역 어휘(area_code CHECK):
--   '1' 회의·통화 기록 · '2' 영업 · '3' 마케팅(직접 도구) · '4' 인사 운영(근태·급여·평가, 채용 제외) · '5' 리뷰 관리
--   'design' 디자인(임시 — Carat·Canva·MiriCanvas). 숫자를 쓰지 않는 이유: 라벨 판독 `^([1-5]):`(target-supply.ts areaOf)·
--            옛 사전 파일 번호(01~07)·옛 ⑥⑦ 어느 것과도 겹치지 않고, 임시 영역이라 나중에 번호 체계를 건드리지 않고 접거나 옮길 수 있다.
--   'hold' 보류(지도 hold·out = ⑥⑦ — 삭제·신규 타깃 금지는 그대로) · 'out-consumer' 영역 외-소비재 · 'out-founder' 영역 외-창업가 불만
--
-- 규칙 v37-1(프로젝트 단위, 위에서부터):
--   1) 타깃 라벨 근거 — `^[1-5]:slug`(T0 뒤 새 형식, area_basis='label') 우선, 옛 `NN-영역파일:slug`·접두 없는 slug 는
--      data/area-map-v26.json 으로 해석(area_basis='slug'). `us-en|` 는 벗긴다. T0 전/후 어느 상태에서도 같은 코드가 나온다.
--   2) 타깃 근거가 없을 때만 소개문 제품명 근거(`<사전 name> —` / `<사전 name> (`, area_basis='name').
--   3) 지도 hold·out → 'hold'. carat·canva·miricanvas → 'design'(지도 값 3 보다 먼저).
--   4) 근거가 하나도 없으면 영역 외 태그(area_basis='source'): 입력 출처가 전부 hackernews·indiehackers·producthunt·disquiet·okky
--      면 'out-founder', 아니면 'out-consumer'(출처 NULL = 사람 붙여넣기 → 소비재 쪽).
--   부여 안 함(NULL 유지, 드라이런 목록으로 보고): CONFLICT(라벨 접두 ≠ 지도) · MULTI(코드 둘 이상 / 이름 근거 2개 이상) ·
--      UNASSIGNED(지도 null) · NO_INPUT(근거 없음 ∧ 입력 0).
--
-- 비파괴·멱등: ADD COLUMN IF NOT EXISTS · CHECK 는 DROP IF EXISTS 후 ADD(새 열 전용) · UPDATE 는 area_code IS NULL 인 행만.
--   재실행하면 이미 부여된 행은 그대로, 그 사이 생긴 새 프로젝트만 채운다. DELETE·DROP COLUMN·타입 축소 없음.
-- 롤백: 20261009000010_analysis_projects_area_rollback.sql — area_rule_ver='v37-1' 인 행만 NULL 로, 뷰 DROP. 열은 남긴다.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 오케스트레이터가 독립 점검 뒤에.
--   §10.2 예외 2번(대량 UPDATE) 4조건: 드라이런=위 문서 · 롤백=파일 · 무중단(새 열만, 기존 열·제약 무관, lock_timeout 5s) · Notion 기록.
--   절차: 1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 드라이런 문서 Q0~Q2 3) 실행 4) 문서 Q3~Q5 5) docs/migration-exceptions.md
--   야간 수집(nightly-review-collect) 시간대를 피한다 — ALTER 가 analysis_projects 에 ACCESS EXCLUSIVE 를 잠깐 잡는다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS area_code        text NULL,
  ADD COLUMN IF NOT EXISTS area_basis       text NULL,
  ADD COLUMN IF NOT EXISTS area_evidence    text NULL,
  ADD COLUMN IF NOT EXISTS area_rule_ver    text NULL,
  ADD COLUMN IF NOT EXISTS area_assigned_at timestamptz NULL;

ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_code_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('1', '2', '3', '4', '5', 'design', 'hold', 'out-consumer', 'out-founder'));
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_basis_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_basis_check
  CHECK (area_basis IS NULL OR area_basis IN ('label', 'slug', 'name', 'source', 'manual'));
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_trace_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_trace_check
  CHECK (area_code IS NULL OR (area_basis IS NOT NULL AND area_rule_ver IS NOT NULL AND area_assigned_at IS NOT NULL));

COMMENT ON COLUMN public.analysis_projects.area_code IS
  '영역(v37 소급, 남헌 v38). 1 회의·통화 기록 · 2 영업 · 3 마케팅 · 4 인사 운영 · 5 리뷰 관리 · design 디자인(임시) · hold 보류(⑥⑦) · out-consumer/out-founder 영역 외 태그. NULL = 미부여(MULTI·CONFLICT 등).';
COMMENT ON COLUMN public.analysis_projects.area_basis IS '부여 근거 종류: label(새 라벨 접두) · slug(옛·무접두 라벨을 지도로 해석) · name(소개문 제품명) · source(입력 출처로 영역 외 태그) · manual(사람).';
COMMENT ON COLUMN public.analysis_projects.area_evidence IS '근거 상세: <basis>:<slug 목록> 또는 sources:<입력 출처 목록>.';
COMMENT ON COLUMN public.analysis_projects.area_rule_ver IS '부여한 규칙 버전. 롤백은 이 값으로 범위를 좁힌다(v37-1).';

-- 불변 확인용 지문(새 열은 빼고 해시) — UPDATE 전에 뜬다.
CREATE TEMP TABLE _area_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg((to_jsonb(p) - ARRAY['area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at'])::text, '|' ORDER BY p.id), ''))
     FROM public.analysis_projects p) AS projects_hash,
  (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), '')) FROM public.review_targets t) AS targets_hash,
  (SELECT count(*) FROM public.analysis_projects WHERE area_code IS NOT NULL) AS pre_assigned;

CREATE TEMP TABLE _area_plan ON COMMIT DROP AS
WITH
-- 제품 사전 254개(reports/2026-10-05/product-dictionary 의 name) × data/area-map-v26.json 값. 생성물 — 손으로 고치지 말 것.
dict(slug, name, v26) AS (VALUES
  ('otter-ai', 'Otter.ai', '1'),
  ('fireflies-ai', 'Fireflies.ai', '1'),
  ('fathom', 'Fathom', '1'),
  ('tldv', 'tl;dv', '1'),
  ('krisp', 'Krisp', '1'),
  ('read-ai', 'Read AI', '1'),
  ('granola', 'Granola', '1'),
  ('avoma', 'Avoma', '1'),
  ('fellow', 'Fellow', '1'),
  ('meetgeek', 'MeetGeek', '1'),
  ('sembly-ai', 'Sembly AI', '1'),
  ('notta', 'Notta', '1'),
  ('supernormal', 'Supernormal', '1'),
  ('tactiq', 'Tactiq', '1'),
  ('bluedot', 'Bluedot', '1'),
  ('jamie', 'Jamie', '1'),
  ('plaud', 'Plaud', '1'),
  ('circleback', 'Circleback', '1'),
  ('rev', 'Rev', '1'),
  ('grain', 'Grain', '1'),
  ('clova-note', 'CLOVA Note', '1'),
  ('daglo', 'daglo', '1'),
  ('tiro', 'Tiro', '1'),
  ('vito', 'VITO', '1'),
  ('callabo', 'Callabo', '1'),
  ('adot', 'A. (에이닷)', '1'),
  ('ixio', 'ixi-O', '1'),
  ('remember-note', 'Remember Note', '1'),
  ('hoirock', 'Hoirock', '1'),
  ('meeting-os', 'Meeting OS', '1'),
  ('callog', 'Callog', '1'),
  ('intercom-fin', 'Intercom Fin', 'hold'),
  ('zendesk-ai', 'Zendesk', 'hold'),
  ('ada', 'Ada', 'hold'),
  ('sierra', 'Sierra', 'hold'),
  ('decagon', 'Decagon', 'hold'),
  ('forethought', 'Forethought', 'hold'),
  ('freshdesk', 'Freshdesk', 'hold'),
  ('kore-ai', 'Kore.ai', 'hold'),
  ('yellow-ai', 'Yellow.ai', 'hold'),
  ('tidio', 'Tidio', 'hold'),
  ('gorgias', 'Gorgias', 'hold'),
  ('liveperson', 'LivePerson', 'hold'),
  ('netomi', 'Netomi', 'hold'),
  ('cognigy', 'Cognigy', 'hold'),
  ('zowie', 'Zowie', 'hold'),
  ('gladly', 'Gladly', 'hold'),
  ('kustomer', 'Kustomer', 'hold'),
  ('help-scout', 'Help Scout', 'hold'),
  ('chatbase', 'Chatbase', 'hold'),
  ('salesforce-agentforce', 'Salesforce Agentforce', 'hold'),
  ('channel-talk', 'Channel Talk', 'hold'),
  ('happytalk', 'Happytalk', 'hold'),
  ('kt-ai-call-assistant', 'KT AI 통화비서', 'hold'),
  ('wisenut', 'WISEnut', 'hold'),
  ('skelterlabs', 'Skelter Labs', 'hold'),
  ('danbee-ai', 'danbee.ai', 'hold'),
  ('gong', 'Gong', '2'),
  ('clari', 'Clari', '2'),
  ('outreach', 'Outreach', '2'),
  ('salesloft', 'Salesloft', '2'),
  ('apollo-io', 'Apollo.io', '2'),
  ('clay', 'Clay', '2'),
  ('11x-ai', '11x', '2'),
  ('regie-ai', 'Regie.ai', '2'),
  ('lavender', 'Lavender', '2'),
  ('zoominfo', 'ZoomInfo', '2'),
  ('lusha', 'Lusha', '2'),
  ('attention', 'Attention', '2'),
  ('nooks', 'Nooks', '2'),
  ('orum', 'Orum', '2'),
  ('amplemarket', 'Amplemarket', '2'),
  ('artisan', 'Artisan', '2'),
  ('highspot', 'Highspot', '2'),
  ('people-ai', 'People.ai (현 Backstory)', '2'),
  ('instantly', 'Instantly', '2'),
  ('hubspot-sales-hub', 'HubSpot Sales Hub', '2'),
  ('salesmap', 'Salesmap', '2'),
  ('deepsales', 'DeepSales', '2'),
  ('jasper', 'Jasper', '3'),
  ('copy-ai', 'Copy.ai', '3'),
  ('adcreative-ai', 'AdCreative.ai', '3'),
  ('anyword', 'Anyword', '3'),
  ('writesonic', 'Writesonic', '3'),
  ('predis-ai', 'Predis.ai', '3'),
  ('pencil', 'Pencil', '3'),
  ('ocoya', 'Ocoya', '3'),
  ('simplified', 'Simplified', '3'),
  ('canva', 'Canva (Magic Studio)', '3'),
  ('foreplay', 'Foreplay', '3'),
  ('motion-creative', 'Motion', '3'),
  ('creatify', 'Creatify', '3'),
  ('arcads', 'Arcads', '3'),
  ('hootsuite-owlywriter', 'Hootsuite (OwlyWriter AI)', '3'),
  ('lately', 'Lately', '3'),
  ('typeface', 'Typeface', '3'),
  ('persado', 'Persado', '3'),
  ('omneky', 'Omneky', '3'),
  ('pictory', 'Pictory', '3'),
  ('vcat-ai', 'VCAT.AI', '3'),
  ('draph-art', 'Draph Art', '3'),
  ('adgen-ai', 'AdGen AI', '3'),
  ('gmp-creatives', 'GMP Creatives', '3'),
  ('sigmine', 'Sigmine', '3'),
  ('mirr', 'Mirr', '3'),
  ('astarmize', 'ASTARMIZE (AVICA)', '3'),
  ('aisac', 'AiSAC', '3'),
  ('copykle', 'Copykle', '3'),
  ('mangoboard', 'Mangoboard (AI Designer)', '3'),
  ('miricanvas', 'MiriCanvas', '3'),
  ('carat', 'Carat', '3'),
  ('designstaff', 'DesignStaff', '3'),
  ('q2cut', 'Q2Cut', '3'),
  ('grammarly', 'Grammarly', '5'),
  ('quillbot', 'QuillBot', '5'),
  ('wordtune', 'Wordtune', '5'),
  ('prowritingaid', 'ProWritingAid', 'hold'),
  ('hemingway-editor', 'Hemingway Editor', 'hold'),
  ('languagetool', 'LanguageTool', 'hold'),
  ('deepl-write', 'DeepL Write', 'hold'),
  ('notion-ai', 'Notion AI', '5'),
  ('coda-ai', 'Coda AI (Superhuman Docs)', 'hold'),
  ('craft-docs', 'Craft', '5'),
  ('microsoft-word-copilot', 'Microsoft Word (Copilot)', 'hold'),
  ('sudowrite', 'Sudowrite', '5'),
  ('lex', 'Lex', 'hold'),
  ('jenni-ai', 'Jenni AI', 'hold'),
  ('rytr', 'Rytr', 'hold'),
  ('gamma', 'Gamma', '5'),
  ('tome', 'Tome', 'hold'),
  ('beautiful-ai', 'Beautiful.ai', 'hold'),
  ('paperpal', 'Paperpal', 'hold'),
  ('ginger', 'Ginger', '5'),
  ('wrtn', 'Wrtn', '5'),
  ('clova-x', 'CLOVA X', 'hold'),
  ('clova-for-writing', 'CLOVA for Writing', 'hold'),
  ('bareun-hangul', 'Bareun Hangul (PNU Korean Spell Checker)', 'hold'),
  ('copykiller', 'CopyKiller', 'hold'),
  ('hancom-assistant', 'Hancom Assistant', 'hold'),
  ('polaris-office-ai', 'Polaris Office AI', '5'),
  ('sentencify', 'SENTENCIFY', 'hold'),
  ('engram', 'Engram', 'hold'),
  ('wordvice-ai', 'Wordvice AI', 'hold'),
  ('bareun-ai', 'Bareun AI', 'hold'),
  ('naver-spell-checker', 'NAVER Spell Checker', 'hold'),
  ('daum-spell-checker', 'Daum Spell Checker', 'hold'),
  ('greenhouse', 'Greenhouse', 'out'),
  ('lever', 'Lever', 'out'),
  ('workable', 'Workable', 'out'),
  ('ashby', 'Ashby', 'out'),
  ('bamboohr', 'BambooHR', '4'),
  ('rippling', 'Rippling', '4'),
  ('gusto', 'Gusto', '4'),
  ('hibob', 'HiBob', '4'),
  ('deel', 'Deel', '4'),
  ('personio', 'Personio', '4'),
  ('lattice', 'Lattice', '4'),
  ('culture-amp', 'Culture Amp', '4'),
  ('15five', '15Five', '4'),
  ('paradox', 'Paradox', 'out'),
  ('hirevue', 'HireVue', 'out'),
  ('teamtailor', 'Teamtailor', 'out'),
  ('breezy-hr', 'Breezy HR', 'out'),
  ('jazzhr', 'JazzHR', 'out'),
  ('recruitee', 'Tellent Recruitee', 'out'),
  ('workday', 'Workday HCM', '4'),
  ('greeting-hr', 'Greeting', 'out'),
  ('ninehire', 'NineHire', 'out'),
  ('rivers', 'Rivers', 'out'),
  ('incruit-works', 'Incruit Works', 'out'),
  ('careeron', 'CareerOn', 'out'),
  ('roundhr', 'RoundHR', 'out'),
  ('stead', 'Stead', 'out'),
  ('candidate', 'Candidate Biz', 'out'),
  ('wiselection', 'wiselection', 'out'),
  ('metajob', 'MetaJob', 'out'),
  ('jobda', 'JOBDA', 'out'),
  ('h-place', 'h.place', '4'),
  ('viewinter-hr', 'ViewinterHR', 'out'),
  ('telta-interview-pro', 'Telta Interview Pro', 'out'),
  ('highbuff-interview', 'Highbuff Interview', 'out'),
  ('specter', 'Specter', 'out'),
  ('teo', 'TEO', 'out'),
  ('muhayu-monster', 'Monster', 'out'),
  ('supercoder-ai-interview', 'Supercoder AI Interview', 'out'),
  ('flex', 'flex', '4'),
  ('shiftee', 'Shiftee', '4'),
  ('wanted-space', 'Wanted Space', '4'),
  ('daouoffice-hr', 'DaouOffice HR', '4'),
  ('evertime', 'EverTime', '4'),
  ('everin', 'EverIn', '4'),
  ('ustra-hr', 'U.STRA HR', '4'),
  ('next-hr', 'Next HR (SINGLEX HR)', '4'),
  ('workup', 'WORKUP', '4'),
  ('shopl', 'Shopl', '4'),
  ('pinat', 'Pinat', '4'),
  ('timeinout', 'TimeInOut', '4'),
  ('hulam', 'Hulam', '4'),
  ('timekeeper', 'TimeKeeper', '4'),
  ('ochul', 'Ochul', '4'),
  ('newploy', 'Newploy', '4'),
  ('payzon', 'Payzon', '4'),
  ('ttree', 'TTREE', '4'),
  ('cinplus', 'CinPlus', '4'),
  ('lemonbase', 'Lemonbase', '4'),
  ('clap', 'CLAP', '4'),
  ('klaviyo', 'Klaviyo', '3'),
  ('omnisend', 'Omnisend', '3'),
  ('yotpo', 'Yotpo', '5'),
  ('judge-me', 'Judge.me', '5'),
  ('loox', 'Loox', '5'),
  ('okendo', 'Okendo', '5'),
  ('recharge', 'Recharge', 'out'),
  ('shipstation', 'ShipStation', 'out'),
  ('aftership', 'AfterShip', 'out'),
  ('linnworks', 'Linnworks', 'out'),
  ('sellbrite', 'Sellbrite', 'out'),
  ('helium-10', 'Helium 10', 'out'),
  ('jungle-scout', 'Jungle Scout', 'out'),
  ('triple-whale', 'Triple Whale', '3'),
  ('rebuy', 'Rebuy', NULL),
  ('smile-io', 'Smile.io', NULL),
  ('postscript', 'Postscript', '3'),
  ('inventory-planner', 'Inventory Planner', 'out'),
  ('privy', 'Privy', '3'),
  ('attentive', 'Attentive', '3'),
  ('sabangnet', 'Sabangnet', 'out'),
  ('playauto', 'PlayAuto', 'out'),
  ('ezadmin', 'EZADMIN', 'out'),
  ('shoplinker', 'Shoplinker', 'out'),
  ('sellmate', 'Sellmate', 'out'),
  ('esellers', 'eSellers', 'out'),
  ('sweep', 'Sweep', 'out'),
  ('sello', 'Sello', 'out'),
  ('sellerbox', 'Sellerbox', 'out'),
  ('shopmoa', 'Shopmoa', 'out'),
  ('sellerhub', 'Sellerhub', 'out'),
  ('shopmine', 'Shopmine', 'out'),
  ('crema', 'CREMA', '5'),
  ('alpha-review', 'Alpha Review', '5'),
  ('vreview', 'VREVIEW', '5'),
  ('snapreview', 'SnapReview', '5'),
  ('itemscout', 'Itemscout', 'out'),
  ('pandarank', 'Pandarank', 'out'),
  ('sellochomes', 'Sellochomes', 'out'),
  ('helpstore', 'Helpstore', 'out'),
  ('sellerbot-cash', 'Sellerbot Cash', 'out'),
  ('goodsflow', 'Goodsflow', 'out'),
  ('snappush', 'SnapPush', '3'),
  ('bigin', 'Bigin', NULL),
  ('datarize', 'Datarize', '3'),
  ('bigcell', 'BigCell', 'out'),
  ('sellerking', 'Sellerking', 'out'),
  ('dashpanda', 'DashPanda', 'out')
),
-- 근거 원천 두 갈래. ① 타깃 라벨: 새 형식 `N:slug`(T0 뒤) · 옛 형식 `NN-영역파일:slug`(T0 전) · 접두 없는 `slug`, 셋 다 `us-en|` 를 벗긴다.
--                ② 프로젝트 소개문: `<사전 name> —` 또는 `<사전 name> (` 로 시작(scripts/dictionary-targets.mjs productPitch 형식).
raw AS (
  SELECT t.project_id,
         substring(t.label from '^([1-5]):') AS pfx,
         CASE WHEN t.label ~ '^[1-5]:' THEN 'label' ELSE 'slug' END AS basis,
         regexp_replace(regexp_replace(t.label, '^([1-5]|[0-9]{2}-[a-z0-9-]+):', ''), '^us-en\|', '') AS slug
    FROM public.review_targets t
   WHERE t.project_id IS NOT NULL AND t.label IS NOT NULL
  UNION ALL
  SELECT p.id, NULL, 'name', d.slug
    FROM public.analysis_projects p
    JOIN dict d ON lower(left(p.product_elevator_pitch, length(d.name) + 2)) IN (lower(d.name) || ' —', lower(d.name) || ' (')
),
-- 근거 한 줄 → 코드. 디자인 3개는 지도 값(3)보다 먼저 떼어 낸다. hold·out → 'hold'(⑥⑦ 보류). 지도 null → UNASSIGNED(부여 안 함).
ev AS (
  SELECT r.project_id, r.basis, r.slug,
         CASE
           WHEN d.slug IS NULL THEN r.pfx                                         -- 사전에 없는 slug: 새 접두만 근거, 없으면 근거 아님
           WHEN r.pfx IS NOT NULL AND d.v26 IS DISTINCT FROM r.pfx THEN 'CONFLICT' -- 라벨 접두와 지도가 다르다
           WHEN d.slug IN ('carat', 'canva', 'miricanvas') THEN 'design'
           WHEN d.v26 IN ('hold', 'out') THEN 'hold'
           WHEN d.v26 IS NULL THEN 'UNASSIGNED'
           ELSE d.v26
         END AS code
    FROM raw r LEFT JOIN dict d ON d.slug = r.slug
),
-- 우선순위: 타깃 근거(label/slug)가 하나라도 있으면 그것만, 없을 때만 이름 근거.
ev2 AS (
  SELECT ev.*, bool_or(basis <> 'name') OVER (PARTITION BY project_id) AS has_tgt
    FROM ev WHERE code IS NOT NULL
),
ep AS (
  SELECT project_id,
         count(DISTINCT code) AS n_codes,
         count(DISTINCT slug) AS n_slugs,
         min(code) AS code,
         bool_or(code = 'CONFLICT') AS conflict,
         CASE WHEN bool_or(basis = 'label') THEN 'label' WHEN bool_or(basis = 'slug') THEN 'slug' ELSE 'name' END AS basis,
         string_agg(DISTINCT slug, ',' ORDER BY slug) AS slugs
    FROM ev2 WHERE has_tgt = (basis <> 'name')
   GROUP BY project_id
),
-- 영역 외 태그 근거: 입력 출처. NULL 출처(사람 붙여넣기)는 창업가 출처가 아니다(coalesce — bool_and 는 NULL 을 건너뛴다).
ip AS (
  SELECT project_id, count(*) AS n,
         bool_and(coalesce(source_key IN ('hackernews', 'indiehackers', 'producthunt', 'disquiet', 'okky'), false)) AS founder,
         string_agg(DISTINCT coalesce(source_key, '(manual)'), ',' ORDER BY coalesce(source_key, '(manual)')) AS sources
    FROM public.analysis_inputs WHERE project_id IS NOT NULL
   GROUP BY project_id
),
plan AS (
  SELECT p.id AS project_id, p.product_elevator_pitch AS pitch, coalesce(ip.n, 0) AS inputs,
         s.status,
         CASE s.status
           WHEN 'ASSIGNED' THEN ep.code
           WHEN 'OUT' THEN CASE WHEN ip.founder THEN 'out-founder' ELSE 'out-consumer' END
         END AS code,
         CASE s.status WHEN 'ASSIGNED' THEN ep.basis WHEN 'OUT' THEN 'source' END AS basis,
         CASE WHEN ep.project_id IS NOT NULL THEN ep.basis || ':' || ep.slugs ELSE 'sources:' || coalesce(ip.sources, '-') END AS evidence
    FROM public.analysis_projects p
    LEFT JOIN ep ON ep.project_id = p.id
    LEFT JOIN ip ON ip.project_id = p.id
    CROSS JOIN LATERAL (SELECT CASE
           WHEN ep.conflict THEN 'CONFLICT'
           WHEN ep.n_codes > 1 OR (ep.basis = 'name' AND ep.n_slugs > 1) THEN 'MULTI'
           WHEN ep.code = 'UNASSIGNED' THEN 'UNASSIGNED'
           WHEN ep.code IS NOT NULL THEN 'ASSIGNED'
           WHEN coalesce(ip.n, 0) = 0 THEN 'NO_INPUT'
           ELSE 'OUT'
         END AS status) s
)
SELECT project_id, inputs, status, code, basis, evidence FROM plan;

CREATE TEMP TABLE _area_done (project_id uuid) ON COMMIT DROP;

WITH upd AS (
  UPDATE public.analysis_projects p
     SET area_code = pl.code,
         area_basis = pl.basis,
         area_evidence = pl.evidence,
         area_rule_ver = 'v37-1',
         area_assigned_at = now()
    FROM _area_plan pl
   WHERE p.id = pl.project_id
     AND pl.code IS NOT NULL
     AND p.area_code IS NULL
  RETURNING p.id
)
INSERT INTO _area_done SELECT id FROM upd;

CREATE OR REPLACE VIEW public.v_input_area WITH (security_invoker = true) AS
SELECT i.id AS input_id,
       i.project_id,
       i.source_key,
       p.area_code,
       CASE p.area_code
         WHEN '1' THEN '① 회의·통화 기록' WHEN '2' THEN '② 영업' WHEN '3' THEN '③ 마케팅'
         WHEN '4' THEN '④ 인사 운영' WHEN '5' THEN '⑤ 리뷰 관리' WHEN 'design' THEN '디자인(임시)'
         WHEN 'hold' THEN '보류' WHEN 'out-consumer' THEN '영역 외-소비재' WHEN 'out-founder' THEN '영역 외-창업가 불만'
       END AS area_name,
       coalesce(p.area_code IN ('1', '2', '3', '4', '5', 'design'), false) AS in_scope,
       p.area_basis,
       p.area_rule_ver
  FROM public.analysis_inputs i
  LEFT JOIN public.analysis_projects p ON p.id = i.project_id;
COMMENT ON VIEW public.v_input_area IS '입력 단위 영역(읽기 전용). 영역 값은 analysis_projects.area_code 를 따른다. area_code NULL = 미부여·프로젝트 없음.';
REVOKE ALL ON public.v_input_area FROM anon, authenticated;

DO $$
DECLARE
  b record;
  v_vocab int; v_unfilled int; v_mismatch int; v_wrong int;
  v_proj_hash text; v_tgt_hash text;
  v_total bigint; v_grouped bigint;
  v_done int; r record;
BEGIN
  SELECT * INTO b FROM _area_before;

  -- ① 어휘 위반 0 (CHECK 와 별개로 직접 센다)
  SELECT count(*) INTO v_vocab FROM public.analysis_projects
   WHERE area_code IS NOT NULL AND area_code NOT IN ('1','2','3','4','5','design','hold','out-consumer','out-founder');
  IF v_vocab <> 0 THEN RAISE EXCEPTION '어휘 위반 %행', v_vocab; END IF;

  -- ② 부여 대상인데 비어 있는 행 0 · 이번에 쓴 행은 계획과 같은 코드 · 부여 안 함(MULTI 등)은 이번에 안 썼다
  SELECT count(*) INTO v_unfilled FROM _area_plan pl JOIN public.analysis_projects p ON p.id = pl.project_id
   WHERE pl.code IS NOT NULL AND p.area_code IS NULL;
  IF v_unfilled <> 0 THEN RAISE EXCEPTION '부여 대상 %행이 비어 있다', v_unfilled; END IF;
  SELECT count(*) INTO v_mismatch FROM _area_done d JOIN _area_plan pl USING (project_id) JOIN public.analysis_projects p ON p.id = d.project_id
   WHERE p.area_code IS DISTINCT FROM pl.code OR p.area_rule_ver <> 'v37-1';
  IF v_mismatch <> 0 THEN RAISE EXCEPTION '계획과 다른 부여 %행', v_mismatch; END IF;
  SELECT count(*) INTO v_wrong FROM _area_done d JOIN _area_plan pl USING (project_id) WHERE pl.code IS NULL;
  IF v_wrong <> 0 THEN RAISE EXCEPTION '부여 안 함(MULTI·CONFLICT·UNASSIGNED·NO_INPUT) %행에 썼다', v_wrong; END IF;

  -- ③ 기존 열 불변 · 원라벨(review_targets 전체 행) 불변
  SELECT md5(coalesce(string_agg((to_jsonb(p) - ARRAY['area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at'])::text, '|' ORDER BY p.id), ''))
    INTO v_proj_hash FROM public.analysis_projects p;
  IF v_proj_hash <> b.projects_hash THEN RAISE EXCEPTION 'analysis_projects 기존 열이 바뀌었다(트리거?)'; END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), '')) INTO v_tgt_hash FROM public.review_targets t;
  IF v_tgt_hash <> b.targets_hash THEN RAISE EXCEPTION 'review_targets(원라벨)가 바뀌었다'; END IF;

  -- ④ 입력 합계: 적용 순간의 analysis_inputs 전체 수 = 뷰의 영역 그룹 합(NULL 그룹 포함). 한 문장 = 한 스냅숏.
  SELECT (SELECT count(*) FROM public.analysis_inputs),
         (SELECT coalesce(sum(n), 0) FROM (SELECT count(*) AS n FROM public.v_input_area GROUP BY area_code) g)
    INTO v_total, v_grouped;
  IF v_total <> v_grouped THEN RAISE EXCEPTION '입력 합계 불일치: 전체 % ≠ 그룹 합 %', v_total, v_grouped; END IF;

  SELECT count(*) INTO v_done FROM _area_done;
  RAISE NOTICE '영역 소급 v37-1: 이번 부여 % · 적용 전 부여돼 있던 행 % · 입력 전체 %', v_done, b.pre_assigned, v_total;
  FOR r IN SELECT coalesce(p.area_code, '(미부여)') AS c, count(DISTINCT p.id) AS projects, count(i.id) AS inputs
             FROM public.analysis_projects p LEFT JOIN public.analysis_inputs i ON i.project_id = p.id
            GROUP BY 1 ORDER BY 1 LOOP
    RAISE NOTICE '  % · 프로젝트 % · 입력 %', r.c, r.projects, r.inputs;
  END LOOP;
END $$;

COMMIT;

-- 적용 후 확인 쿼리(양성·음성·샘플)는 reports/2026-10-09/area-backfill-dryrun.md Q3~Q5.
