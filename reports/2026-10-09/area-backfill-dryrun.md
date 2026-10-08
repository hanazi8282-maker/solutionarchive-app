# 소급 영역 부여 — 드라이런 (v37 작업 1, 남헌 v38 승인, 2026-10-09)

> 서브에이전트 산출물이다. **DB 에 아무것도 쓰지 않았고 읽지도 않았다**(서비스키 없음). 아래 질의는 오케스트레이터가 돌린다.
> 마이그: `supabase/migrations/20261009000020_analysis_projects_area.sql` (+ `_rollback.sql`). **미적용.**
> 원문(raw_text)은 이 문서에 없다. Q4 결과(원문 앞 120자)는 리포에 커밋하지 않는다 — 공개 리포다(CLAUDE.md §2).

## 0. 적용 전 체크리스트 C1~C6 (독립 점검 반영)

하나라도 기대와 다르면 적용하지 않는다.

```sql
-- C1 analysis_projects 사용자 트리거 0 (있으면 DO ③ 이 RAISE 한다 — 미리 본다)
SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.analysis_projects'::regclass AND NOT tgisinternal;   -- 0
-- C2 ⑤ 갈래별 예정 수치 → 아래 Q1B (⑤ 수치는 반드시 갈래별로 본다)
-- C3 권한: 뷰는 security_invoker 라 밑 테이블 권한을 따른다. 적용 전 = 밑 테이블, 적용 후 = 뷰(Q3 에도 있음)
SELECT has_table_privilege('service_role', 'public.analysis_inputs', 'SELECT') AS sr_inputs,
       has_table_privilege('service_role', 'public.analysis_projects', 'SELECT') AS sr_projects;           -- true · true
--   적용 후: SELECT has_table_privilege('service_role','public.v_input_area','SELECT'),     -- true
--                   has_table_privilege('anon','public.v_input_area','SELECT'),             -- false
--                   has_table_privilege('authenticated','public.v_input_area','SELECT');    -- false
-- C4 purged 비중(영역별 입력 수 해석용 — 총수에는 purged 행이 들어간다)
SELECT count(*) FILTER (WHERE purged_at IS NOT NULL) AS purged, count(*) AS total FROM public.analysis_inputs;
-- C5 디자인 3 slug 라벨 — 같은 프로젝트에 다른 ③ 제품이 섞였으면 그 프로젝트는 MULTI(부여 안 함)
SELECT project_id, array_agg(label ORDER BY label) AS labels FROM public.review_targets
 WHERE project_id IN (SELECT project_id FROM public.review_targets WHERE label ~ '(^|[:|])(carat|canva|miricanvas)$')
 GROUP BY 1;
-- C6 실행 중 쿼리 0 (락 대기 방지 — lock_timeout 5s 에 걸리면 쓰기 0 으로 끝나니 재시도)
SELECT pid, state, now() - xact_start AS age, left(query, 80) AS q FROM pg_stat_activity
 WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
   AND (query ILIKE '%analysis_projects%' OR query ILIKE '%review_targets%' OR query ILIKE '%analysis_inputs%');  -- 0행
```

## 결론

- 열 5개(`area_code`·`area_basis`·`area_evidence`·`area_rule_ver`·`area_assigned_at`, 전부 NULL 허용)를 `analysis_projects` 에 더하고 규칙 `v37-1` 로 **비어 있는 행만** 채운다. 입력 단위는 읽기 뷰 `v_input_area`(security_invoker, anon·authenticated 권한 회수, 입력의 `purged_at` 포함).
- 원라벨(`review_targets.label`)·기존 열·`analysis_inputs` 는 안 건드린다. 마이그 끝의 DO 가 해시로 확인하고 다르면 전부 롤백한다. 해시 비교가 수집 러너 쓰기 때문에 거짓 RAISE 하지 않도록 `review_targets` 를 SHARE 로 잠근다.
- 디자인 임시 영역 코드: **`design`**. 이유는 §1.
- 합계 검증은 고정 수치가 아니다. 마이그 DO ④ 가 **코드별 입력 수 기대값(계획 × analysis_inputs)과 뷰의 코드별 그룹 합을 칸별로** 비교한다(한 SELECT = 한 스냅숏). 전체 수 = 그룹 합은 보조.
- **RAISE·lock_timeout 으로 멈추면 트랜잭션 전체가 롤백돼 쓰기 0 이다 — 메시지를 보고 그대로 재시도한다.**
- 재실행(새 프로젝트 채우기)은 **대화형 세션 전용**이다. 무인 루프(cron)에서 돌리면 §10.1 위반(무인 루프는 `analysis_projects` UPDATE 금지).
- 소비처는 `area_code IS NULL` 을 **'미부여'** 로 다룬다. '영역 외'로 접지 않는다. 새 프로젝트는 재실행 전까지 NULL 이다.

## 1. 어휘·코드

- `'1'` ① 회의·통화 기록 · `'2'` ② 영업 · `'3'` ③ 마케팅(직접 도구) · `'4'` ④ 인사 운영(근태·급여·평가, 채용 제외)
- `'5'` **⑤ 시험(리뷰 관리·글쓰기)** — 정본은 "리뷰 관리/글쓰기 시험 후 하나". 지금은 두 갈래가 같은 코드에 있으므로 **⑤ 수치는 반드시 갈래별로 본다**(Q1B·Q3). 택1 뒤 재태깅 절차는 §7.
- `'design'` 디자인(임시) — carat·canva·miricanvas 3개. 지도 값은 3 이지만 지도보다 먼저 떼어 낸다.
  - 숫자를 안 쓰는 이유 1: `6`·`7` 은 옛 ⑥⑦(고객상담·이커머스, 보류)과 같은 번호다. 같은 숫자가 다른 뜻이 되는 사고를 이미 한 번 겪었다(사전 파일 01~07 vs 지도 1~5, area-backfill-draft-v31 §1).
  - 이유 2: 라벨 판독 `^([1-5]):`(lib/review/target-supply.ts areaOf)·`^[0-9]{2}-` 옛 라벨 어느 정규식에도 안 걸린다.
  - 이유 3: 임시 영역이다. 나중에 ③ 으로 접거나 정식 번호를 줄 때 값 하나만 바꾸면 된다.
- `'hold'` 보류 — 지도 `hold`(고객상담·시험 암 아닌 글쓰기)와 `out`(채용·이커머스 운영) 둘 다.
- `'out-consumer'` 영역 외-소비재 · `'out-founder'` 영역 외-창업가 불만 — 영역이 아니라 **태그**다. 뷰의 `in_scope` 는 1~5·design 만 true.
- `area_basis`: `label`(새 접두 `N:`) · `slug`(옛 `NN-영역파일:` 또는 무접두 slug 를 지도로 해석) · `name`(소개문 제품명) · `source`(영역 외 태그) · `manual`(사람).
  - **규약: 사람이 영역을 고칠 때는 `area_basis='manual'` 로 쓴다.** 롤백이 그 행을 건드리지 않는다(`area_rule_ver` 가 `v37-1` 로 남아 있어도).

## 2. 규칙 v37-1 (프로젝트 단위)

1. 타깃 라벨 근거가 하나라도 있으면 그것만 쓴다. `^[1-5]:slug` 는 접두가 근거(basis `label`), 옛 `01-meeting-notes:slug`·무접두 `slug` 는 `data/area-map-v26.json` 으로 해석(basis `slug`). **`us-en|`·`us|` 는 벗긴다** — 그래서 `2:us|otter-ai` 같은 앱스토어 US 라벨도 CONFLICT 검사를 받는다.
   - T0 전/후 결과 코드가 같다. 다른 것은 basis 뿐(T0 전 `slug` → T0 뒤 `label`). 셀프테스트로 확인(§6).
   - 사전에 없는 slug 라도 새 접두 `N:` 이 있으면 그 접두를 근거로 쓴다(`5:wp|…`·`5:shopify|…` ⑤ 리뷰 관리 시험 소스가 여기). 접두도 사전도 없는 라벨(`q:…`·발굴 엔진 이름)은 근거가 아니다.
2. 타깃 근거가 없을 때만 소개문(`product_elevator_pitch`)이 `<사전 name> —` 또는 `<사전 name> (` 로 시작하는지 본다(basis `name`). 사전 254개 name 은 서로 겹치지 않는다(셀프테스트 254/254).
3. 코드 변환: carat·canva·miricanvas → `design` · 지도 hold·out → `hold` · 지도 1~5 → 그 숫자 · 지도 null(rebuy·smile-io·bigin) → UNASSIGNED.
   - **디자인과 다른 ③ 제품이 한 프로젝트에 섞이면 MULTI(부여 안 함)가 기대 동작이다.** 예: `3:us|canva` + `3:jasper` → design·3 두 코드 → MULTI. `3:canva` + `3:us|canva` 는 같은 slug 라 design.
4. 근거가 없고 입력이 있으면 영역 외 태그. 입력 출처가 **전부** hackernews·indiehackers·producthunt·disquiet·okky 면 `out-founder`, 하나라도 다르면 `out-consumer`. 출처 NULL(사람 붙여넣기)은 소비재 쪽 — `bool_and` 가 NULL 을 건너뛰는 함정을 `coalesce(…, false)` 로 막았다.
5. 부여 안 함(NULL 유지 · Q1 목록으로 보고):
   - `CONFLICT` 라벨 접두 ≠ 지도 값(예 `2:otter-ai`, `2:us|otter-ai`)
   - `MULTI` 근거 코드가 둘 이상, 또는 이름 근거가 두 제품에 걸림
   - `UNASSIGNED` 지도 null
   - `NO_INPUT` 근거 없음 ∧ 입력 0 — 소비재/창업가를 못 가른다(§7.1). 입력이 생긴 뒤 정방향을 다시 돌리면 채워진다(대화형 세션에서).
6. 이미 값이 있는 행(재실행·사람 입력)은 건드리지 않는다. 적용 뒤 입력 출처가 바뀌어도 영역 외 태그는 그때 값 그대로다(§7).

## 3. 적용 전 — 읽기 전용 질의 (오케스트레이터 실행)

### Q0. 상태 확인

```sql
-- 열 존재(기대 0, 재실행이면 5)
SELECT count(*) FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'analysis_projects'
   AND column_name IN ('area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at');
-- 뷰 존재(기대 0)
SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_input_area';
-- T0 상태(참고 — 어느 쪽이든 결과 코드는 같다): T0 전 84 · T0 뒤 26
SELECT count(*) FROM public.review_targets WHERE label ~ '^[0-9]{2}-';
-- 기준 수치(적용 직전 다시 뜬다)
SELECT (SELECT count(*) FROM public.analysis_projects) AS projects, (SELECT count(*) FROM public.analysis_inputs) AS inputs;
-- 불변 지문 — 적용 후 Q3 의 같은 질의와 비교
SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)) AS targets_hash FROM public.review_targets t;
SELECT md5(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id)) AS projects_hash FROM public.analysis_projects p;
```

### Q1. 프로젝트별 부여 예정표 (프로젝트 · 부여 코드 · 근거 · 입력 수)

부여 안 함(CONFLICT·MULTI·NO_INPUT·UNASSIGNED)이 맨 위에 온다. 그 행들이 사람에게 올릴 목록이다.

```sql
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
-- 근거 원천 두 갈래. ① 타깃 라벨: 새 형식 `N:slug`(T0 뒤) · 옛 형식 `NN-영역파일:slug`(T0 전) · 접두 없는 `slug`, 셋 다 `us-en|`·`us|` 를 벗긴다.
--                ② 프로젝트 소개문: `<사전 name> —` 또는 `<사전 name> (` 로 시작(scripts/dictionary-targets.mjs productPitch 형식).
raw AS (
  SELECT t.project_id,
         substring(t.label from '^([1-5]):') AS pfx,
         CASE WHEN t.label ~ '^[1-5]:' THEN 'label' ELSE 'slug' END AS basis,
         regexp_replace(regexp_replace(t.label, '^([1-5]|[0-9]{2}-[a-z0-9-]+):', ''), '^(us-en|us)\|', '') AS slug
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
SELECT status, coalesce(code, '-') AS code, coalesce(basis, '-') AS basis, left(pitch, 60) AS project, evidence, inputs, project_id
  FROM plan
 ORDER BY CASE WHEN code IS NULL THEN 0 ELSE 1 END, status, code, inputs DESC;
```

### Q1B. ⑤ 갈래별 예정 수치 (C2)

갈래: evidence 가 `(wp|shopify)|` → `review-wp/shopify` · 글쓰기 시험 10 slug(grammarly·quillbot·wordtune·notion-ai·craft-docs·sudowrite·gamma·ginger·wrtn·polaris-office-ai) → `writing-trial` · 그 밖 → `review-other`. **⑤ 합계 하나만 보고 판단하지 않는다.**

```sql
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
-- 근거 원천 두 갈래. ① 타깃 라벨: 새 형식 `N:slug`(T0 뒤) · 옛 형식 `NN-영역파일:slug`(T0 전) · 접두 없는 `slug`, 셋 다 `us-en|`·`us|` 를 벗긴다.
--                ② 프로젝트 소개문: `<사전 name> —` 또는 `<사전 name> (` 로 시작(scripts/dictionary-targets.mjs productPitch 형식).
raw AS (
  SELECT t.project_id,
         substring(t.label from '^([1-5]):') AS pfx,
         CASE WHEN t.label ~ '^[1-5]:' THEN 'label' ELSE 'slug' END AS basis,
         regexp_replace(regexp_replace(t.label, '^([1-5]|[0-9]{2}-[a-z0-9-]+):', ''), '^(us-en|us)\|', '') AS slug
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
SELECT CASE WHEN evidence ~ '(wp|shopify)\|' THEN 'review-wp/shopify'
            WHEN evidence ~ '[:,](grammarly|quillbot|wordtune|notion-ai|craft-docs|sudowrite|gamma|ginger|wrtn|polaris-office-ai)(,|$)' THEN 'writing-trial'
            ELSE 'review-other' END AS arm,
       count(*)::bigint AS projects, sum(inputs)::bigint AS inputs, string_agg(evidence, ' / ' ORDER BY inputs DESC) AS evidence
  FROM plan WHERE code = '5'
 GROUP BY 1 ORDER BY 1;
```

### Q2. 영역별 합계 + 합계 검증

`TOTAL_CHECK.inputs` = (INPUT_NO_PROJECT 를 포함한) 나머지 행 inputs 합. `TOTAL_CHECK.projects` = INPUT_NO_PROJECT 를 뺀 나머지 행 projects 합. inputs 에는 purged 행이 들어간다(C4).

```sql
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
-- 근거 원천 두 갈래. ① 타깃 라벨: 새 형식 `N:slug`(T0 뒤) · 옛 형식 `NN-영역파일:slug`(T0 전) · 접두 없는 `slug`, 셋 다 `us-en|`·`us|` 를 벗긴다.
--                ② 프로젝트 소개문: `<사전 name> —` 또는 `<사전 name> (` 로 시작(scripts/dictionary-targets.mjs productPitch 형식).
raw AS (
  SELECT t.project_id,
         substring(t.label from '^([1-5]):') AS pfx,
         CASE WHEN t.label ~ '^[1-5]:' THEN 'label' ELSE 'slug' END AS basis,
         regexp_replace(regexp_replace(t.label, '^([1-5]|[0-9]{2}-[a-z0-9-]+):', ''), '^(us-en|us)\|', '') AS slug
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
SELECT status, coalesce(code, '-') AS code, count(*)::bigint AS projects, sum(inputs)::bigint AS inputs FROM plan GROUP BY 1, 2
UNION ALL
SELECT 'INPUT_NO_PROJECT', '-', 0, count(*) FROM public.analysis_inputs WHERE project_id IS NULL
UNION ALL
SELECT 'TOTAL_CHECK', '-', (SELECT count(*) FROM public.analysis_projects), (SELECT count(*) FROM public.analysis_inputs)
ORDER BY 1, 2;
```

## 4. 기대 건수 (오케스트레이터 실측, T0 #473 적용 뒤)

- 1: 28/1,876 · 2: 8/2 · 3: 7/580 · 4: 24/1,038 · 5: 27/3,121 · design: 3/1,050 · hold: 12/594 · out-consumer: 30/18,018 · out-founder: 56/32,240 · NO_INPUT 4 · 총 **58,519**(purged 행 포함).
- 이번 수정(`us|` 벗기기)은 위 수치를 바꾸지 않아야 한다. 바뀐다면 `N:us|slug` 라벨이 지도와 다른(CONFLICT) 프로젝트나 디자인 slug 가 섞인(MULTI) 프로젝트가 생긴 것이다 — 적용 직전 Q2 를 다시 떠서 확인한다(이 서브에이전트는 실 DB 를 못 봤다 — 확인 불가).
- 다르면 Q1 에서 어느 프로젝트가 어느 칸으로 옮겼는지 보고 판단한다. **설명 못 하는 차이는 적용 보류**다.

## 5. 적용 후 — 확인 질의

### Q3. 양성 · 음성

```sql
-- 양성: 열 5 · 뷰 1 · security_invoker · 권한(service_role true / anon·authenticated false)
SELECT count(*) FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'analysis_projects' AND column_name LIKE 'area\_%';      -- 5
SELECT reloptions FROM pg_class WHERE relname = 'v_input_area';                                          -- {security_invoker=true}
SELECT has_table_privilege('service_role', 'public.v_input_area', 'SELECT') AS sr,                       -- true
       has_table_privilege('anon', 'public.v_input_area', 'SELECT') AS anon,                             -- false
       has_table_privilege('authenticated', 'public.v_input_area', 'SELECT') AS authd;                   -- false
-- 양성: 영역별 프로젝트·입력 (Q2 와 같은 칸. 적용 사이 새로 생긴 프로젝트·입력만큼만 다를 수 있다)
SELECT coalesce(p.area_code, '(미부여)') AS area_code, count(DISTINCT p.id) AS projects, count(i.id) AS inputs,
       count(i.id) FILTER (WHERE i.purged_at IS NULL) AS inputs_not_purged
  FROM public.analysis_projects p LEFT JOIN public.analysis_inputs i ON i.project_id = p.id
 GROUP BY 1 ORDER BY 1;
-- 양성: ⑤ 갈래별(입력 수는 purged 제외도 함께)
SELECT CASE WHEN p.area_evidence ~ '(wp|shopify)\|' THEN 'review-wp/shopify'
            WHEN p.area_evidence ~ '[:,](grammarly|quillbot|wordtune|notion-ai|craft-docs|sudowrite|gamma|ginger|wrtn|polaris-office-ai)(,|$)' THEN 'writing-trial'
            ELSE 'review-other' END AS arm,
       count(DISTINCT p.id) AS projects, count(i.id) AS inputs, count(i.id) FILTER (WHERE i.purged_at IS NULL) AS inputs_not_purged
  FROM public.analysis_projects p LEFT JOIN public.analysis_inputs i ON i.project_id = p.id
 WHERE p.area_code = '5' GROUP BY 1 ORDER BY 1;
SELECT area_basis, count(*) FROM public.analysis_projects WHERE area_rule_ver = 'v37-1' GROUP BY 1 ORDER BY 1;
-- 영역별 입력 수를 해석할 때는 purged 를 뺀다(58,519 에는 purged 행이 들어 있다)
SELECT coalesce(area_code, '(미부여)') AS area_code, count(*) AS inputs_not_purged
  FROM public.v_input_area WHERE purged_at IS NULL GROUP BY 1 ORDER BY 1;
-- 보조 합계(한 문장): 두 값이 같아야 한다. 칸별 검증은 마이그 DO ④ 가 이미 했다
SELECT (SELECT count(*) FROM public.analysis_inputs) AS total,
       (SELECT sum(n) FROM (SELECT count(*) AS n FROM public.v_input_area GROUP BY area_code) g) AS grouped;
-- 음성: 부여된 행에 어휘 밖 값 → 정확히 analysis_projects_area_code_check 가 거부해야 한다.
--   (미부여 행을 고르면 trace 제약이 대신 걸려 거짓 통과한다 — 그래서 대상 행과 제약 이름을 둘 다 확인)
DO $$ DECLARE c text; BEGIN
  UPDATE public.analysis_projects SET area_code = '6'
   WHERE id = (SELECT id FROM public.analysis_projects WHERE area_code IS NOT NULL LIMIT 1);
  IF NOT FOUND THEN RAISE EXCEPTION '확인 불가: 부여된 행이 없다'; END IF;
  RAISE EXCEPTION '음성 실패: 어휘 밖 값이 들어갔다';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
  IF c IS DISTINCT FROM 'analysis_projects_area_code_check' THEN RAISE EXCEPTION '음성 실패: 다른 제약(%)이 걸렸다', c; END IF;
  RAISE NOTICE '음성 통과: % (하위 트랜잭션째 되돌림)', c;
END $$;
-- 음성: 원라벨·기존 열 불변 — Q0 의 두 지문과 비교
SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)) AS targets_hash FROM public.review_targets t;
SELECT md5(string_agg((to_jsonb(p) - ARRAY['area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at'])::text, '|' ORDER BY p.id)) AS projects_hash
  FROM public.analysis_projects p;   -- Q0 projects_hash 와 같다(Q0 는 열이 없을 때 떴으므로 키 집합이 같다)
-- 음성: 부여 안 함(MULTI·CONFLICT·UNASSIGNED·NO_INPUT) 수 = Q2 의 그 칸 projects 합
SELECT count(*) FROM public.analysis_projects WHERE area_code IS NULL;
```

- 재실행 멱등: 정방향을 한 번 더 돌리면 NOTICE `이번 부여 0`(그 사이 새 프로젝트가 없다면). 대화형 세션에서만.
- Q0/Q3 projects_hash 비교: 적용 사이 다른 작업이 프로젝트 행을 바꾸면 달라진다 — 그때는 마이그 DO ③(같은 트랜잭션 안 비교)이 정본이다.

### Q4. 영역 외 무작위 20건 (소비재 10 + 창업가 불만 10, seed 재현)

프로젝트당 1건씩 먼저 뽑고(다양성), 모자라면 2번째로 채운다. 다시 뽑을 때만 seed 를 `v37-area-seed-2` 로 바꾼다. 결과는 리포에 커밋하지 않는다.

```sql
WITH params AS (SELECT 'v37-area-seed-1'::text AS seed),
c AS (
  SELECT p.area_code, left(p.product_elevator_pitch, 60) AS project, p.area_evidence,
         left(i.raw_text, 120) AS text_head,
         md5((SELECT seed FROM params) || i.id::text) AS k,
         row_number() OVER (PARTITION BY p.id ORDER BY md5((SELECT seed FROM params) || i.id::text)) AS rn_in_project
    FROM public.analysis_inputs i
    JOIN public.analysis_projects p ON p.id = i.project_id
   WHERE p.area_code IN ('out-consumer', 'out-founder') AND i.raw_text IS NOT NULL
),
r AS (SELECT c.*, row_number() OVER (PARTITION BY area_code ORDER BY rn_in_project, k) AS rn FROM c)
SELECT CASE area_code WHEN 'out-consumer' THEN '영역 외-소비재' ELSE '영역 외-창업가 불만' END AS tag,
       project, area_evidence, text_head
  FROM r WHERE rn <= 10
 ORDER BY area_code, rn;
```

- 판정 기준: "이 글을 낸 프로젝트가 정말 5영역·디자인 밖인가, 태그(소비재/창업가)가 출처와 맞나". 원문 관련성은 T1~T4 소관이라 세지 않는다.
- 각 태그 10건 중 **틀림 2건 이상**이면 그 태그 규칙을 다시 본다(롤백은 롤백 파일 한 번).

### Q5. 합계 검증 방법 (정리)

1. 적용 직전 Q2 를 뜬다 — `TOTAL_CHECK` 와 나머지 행 합이 같아야 질의가 맞다.
2. 마이그 DO ④ 가 같은 트랜잭션 안에서 **코드별** 기대값(`_area_plan`·적용 전 값 × `analysis_inputs`)과 뷰의 코드별 그룹 합을 칸별로 비교한다. 한 칸이라도 다르면 RAISE → 전부 롤백. 고정값(58,519)은 박지 않았다 — 수집이 계속 늘기 때문이다. 전체 수 = 그룹 합은 보조 검사다(뷰가 LEFT JOIN 이라 구조상 거의 항상 참 — 단독으로는 아무것도 증명하지 않는다, §7.1).
3. 적용 뒤 Q3 영역별 표를 Q2 와 칸별로 비교한다. 차이는 "적용 사이 늘어난 입력"으로만 설명돼야 한다(새 입력이 부여된 프로젝트에 붙으면 그 칸이 늘고, 새 프로젝트면 `(미부여)` 가 는다 — 대화형 세션에서 정방향 재실행으로 채운다).
4. 영역별 입력 수를 해석할 때는 purged 제외 질의(Q3)를 쓴다.

## 6. 셀프테스트 (PGlite = WASM Postgres, 리포 밖 일회성 하네스)

합성 프로젝트 29개(영역 1~5 · 디자인 라벨/이름 · 보류 옛 라벨/이름 · 영역 외 소비재 4종(혼합·NULL 출처·HN+NULL·무관 라벨)/창업가 2종 · MULTI · CONFLICT · UNASSIGNED · NO_INPUT · 이름만 · 사전 밖 slug 접두 · 라벨이 이름보다 우선 · 글쓰기 시험 `5:` · `us|` 디자인 단독/③ 섞임 · `us|` CONFLICT · `5:shopify|`) + 프로젝트 없는 입력 2건 + purged 입력 1건에, **리포의 마이그·롤백 파일과 이 문서의 C·Q0~Q4 를 그대로** 실행했다. T0 전 상태와 T0 뒤 상태를 각각 새 DB 로 돌렸다. Supabase 처럼 public 기본 권한(anon·authenticated·service_role ALL)을 걸어 REVOKE 가 실제로 걷어 내는지도 봤다.

```
PASS 체크리스트 C1~C6 실행 · C1 트리거 0 · C3 service_role 밑 테이블 SELECT
PASS Q1B ⑤ 갈래: review-other 1(yotpo) · writing-trial 1(grammarly) · review-wp/shopify 1 — {"review-other":1,"review-wp/shopify":1,"writing-trial":1}
PASS 드라이런 Q1: 29개 프로젝트 상태·코드·근거 기대대로(T0 전)
PASS 드라이런 Q2: TOTAL_CHECK 입력 = 나머지 합 — 41
PASS 드라이런 Q2: TOTAL_CHECK 프로젝트 = 나머지 합 — 29
PASS 정방향: 부여 결과 = 기대(영역 5종·디자인·보류·영역 외 2종·MULTI·CONFLICT·UNASSIGNED·NO_INPUT·us| 3종·shopify|)
PASS 정방향 = 드라이런 계획(코드)
PASS 음성: review_targets(원라벨) 해시 불변
PASS 음성: analysis_inputs 해시 불변
PASS 음성: analysis_projects 기존 열 해시 불변
PASS 뷰: 입력 전체 = 뷰 행 수 = 영역 그룹 합(NULL 포함) — 41/41/41, NULL 그룹 7
PASS 뷰: security_invoker=true — {security_invoker=true}
PASS 뷰: anon/authenticated 권한 0
PASS 뷰 권한(기본 권한 ALL 이 걸린 상태에서): service_role true · anon false · authenticated false
PASS 뷰: purged_at 열로 purged 입력 1건 걸러짐
PASS 음성: 어휘 밖 값(6) CHECK 거부
PASS 음성: 근거·버전 없는 부여 CHECK 거부
PASS 재실행 멱등: 영역 열 전부(시각 포함) 그대로
PASS 재실행: 새 프로젝트만 채움(Gong → 2/name)
PASS 재실행: 기존 부여 행 시각 불변
PASS 재실행: 사람 값(manual) 안 덮음
PASS Q3 확인 질의 실행(문법)·Q4 샘플 재현(같은 seed 같은 결과)
PASS Q4: 태그가 영역 외 둘뿐 · 태그당 ≤10 · purged 원문 제외 — 12건
PASS Q3 음성 검사의 음성: 어휘 CHECK 가 없으면 Q3 가 RAISE(거짓 통과 안 함) — 음성 실패: 어휘 밖 값이 들어갔다
PASS 롤백: v37-1 비manual 행 0 · manual 2행 남음(1번 v37-1+manual · 17번)
PASS 롤백: 열 5개 남음 · 뷰 DROP
PASS 롤백: 원라벨·입력·기존 열 해시 불변
PASS 롤백 재실행 무해
PASS 롤백 뒤 정방향 재적용: 같은 코드로 돌아옴(manual 1·17번 제외·보존)
PASS T0 뒤: 코드 T0 전과 동일 · 2·23번 basis=label
PASS 음성: 기존 열 변경 감지 → RAISE + 열 추가까지 롤백 — analysis_projects 기존 열이 바뀌었다(트리거?)
PASS 음성: 뷰/계획 불일치 주입 → DO ④ 칸별 RAISE + 전부 롤백 — 코드별 입력 수 불일치 6칸 — 뷰와 계획이 다르다
PASS 사전 254 소개문: 이름 근거가 자기 slug 하나 · 코드 = 지도 변환 — 254/254 {"1":31,"2":22,"3":39,"4":32,"5":18,"-":3,"design":3,"hold":106}
ALL PASS
```

- "뷰/계획 불일치 주입"은 마이그 텍스트의 뷰 JOIN 에 `AND i.source_key IS DISTINCT FROM 'googleplay'` 를 넣어 돌린 것이다. 이 경우 LEFT JOIN 은 행을 버리지 않으므로 **전체 수 = 그룹 합은 구조상 여전히 참**이고(googleplay 입력이 NULL 칸으로 갈 뿐), 칸별 비교가 6칸 불일치로 잡았다 — 옛 DO ④ 만으로는 못 잡는 경우다.
- 사전 254 항목: 코드 분포 1=31 · 2=22 · 3=39 · 4=32 · 5=18 · design=3 · hold=106(hold 49 + out 57) · 미부여 3(지도 null) — 지도 집계와 일치.
- 하네스: PGlite 0.2.17(WASM Postgres 16), 리포 밖 일회성 스크립트(커밋 안 함).

## 7. 한계 · 재태깅 절차 · 사람에게 올릴 것

- 실 DB 건수·MULTI/CONFLICT 실제 목록: 이 서브에이전트는 **확인 불가**(DB 미접근). 오케스트레이터 실측은 §4.
- **⑤ 택1 뒤 재태깅 절차**(지도 값 변경은 남헌 몫 — area-quota-and-abandon-design-v31 §3.3):
  1. 남헌 결정에 따라 `data/area-map-v26.json` 을 고친다(예: 글쓰기가 지면 글쓰기 10 slug → `hold`).
  2. 진 갈래의 근거 행만 NULL 로 되돌린다(대화형 세션, 한 트랜잭션, 사람 값 보호). 글쓰기가 진 경우:
     ```sql
     UPDATE public.analysis_projects
        SET area_code = NULL, area_basis = NULL, area_evidence = NULL, area_rule_ver = NULL, area_assigned_at = NULL
      WHERE area_rule_ver = 'v37-1' AND area_code = '5' AND area_basis IS DISTINCT FROM 'manual'
        AND area_evidence !~ '(wp|shopify)\|'
        AND area_evidence ~ '[:,](grammarly|quillbot|wordtune|notion-ai|craft-docs|sudowrite|gamma|ginger|wrtn|polaris-office-ai)(,|$)';
     ```
     리뷰 관리가 진 경우는 조건을 반대로(writing-trial 이 아닌 ⑤ 행).
  3. 정방향을 **새 지도로 다시 생성**해 재실행한다. 정방향 파일은 생성 시점의 지도를 VALUES 로 품고 있어서, 지도만 고치고 v37-1 파일을 다시 돌리면 같은 `5` 가 다시 들어간다. 그래서 다시 만들 때 `area_rule_ver` 를 `v37-2` 로 올린다(롤백 범위가 버전별로 갈린다).
  - 대안: 2·3 을 한 마이그(규칙 v37-2)로 묶는다. 같은 결과이고 되돌리기는 v37-2 롤백 하나다.
- ③ "직접 도구만": 지도 ③ 42개(디자인 3개 제외 39개) 중 "직접 도구"가 아닌 것을 가를 기준이 리포에 없다 — 지도를 그대로 따랐다.
- 영역 외 태그는 "입력 출처 전부" 기준이라 거칠다(남헌 지시 그대로). 적용 뒤 출처가 바뀌어도 태그는 갱신되지 않는다 — 다시 매기려면 롤백 → 정방향.
- 이름 근거는 소개문을 사람이 고친 프로젝트를 못 맞춘다(그런 프로젝트는 영역 외 태그로 간다).
- 셀프테스트 스키마는 이 검사에 필요한 열·제약만 재현했다(FK 일부·RLS·다른 열 없음, Supabase 롤 3개는 직접 만들었다). `pg_stat_activity`(C6)는 PGlite 단일 세션이라 항상 0행 — 실제 동시성은 검증 못 했다.
