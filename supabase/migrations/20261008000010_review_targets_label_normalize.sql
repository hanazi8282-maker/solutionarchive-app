-- ============================================================
-- 20261008000010_review_targets_label_normalize
--
-- v37 작업 2 · T0 라벨 정규화(설계 reports/2026-10-08/english-expansion-design-v31.md §1-5·§T0).
-- 드라이런: reports/2026-10-08/t0-label-normalization-dryrun.md (84행 전부 · 변경 58 · 보류 26 · 충돌 0).
--
-- 왜: review_targets.label 중 옛 투입기(#443 이전, label=`${사전 영역 파일}:${slug}`)가 넣은
--   `01-meeting-notes:<slug>` · `07-ecommerce-ops:<slug>` 꼴(us-en 7개 포함 84행)이 영역 판독 정규식
--   `^([1-5]):`(lib/review/target-supply.ts:175-178 areaOf)에 안 걸려 unmapped 로 센다.
--   지금 투입기는 이미 `${지도 태그}:${slug}` 로 쓴다(scripts/dictionary-targets.mjs:141) — 옛 행만 남은 문제다.
--
-- 무엇을: 아래 VALUES 의 58행만, 지도(data/area-map-v26.json) 값으로 접두를 바꾼다.
--   01-meeting-notes:<slug>        → 1:<slug>         (56행 — us-en 4행은 1:us-en|<slug>)
--   07-ecommerce-ops:triple-whale  → 3:triple-whale   (2행 — 07 중 지도 값이 "1"~"5" 인 것은 이것뿐)
--   07 의 나머지 12 slug(지도 값 out) 26행은 **바꾸지 않는다**(⑥⑦ 보류·삭제 금지 — 드라이런 '보류' 목록).
--
-- 비파괴:
--   - `label_original text NULL` 열 추가(IF NOT EXISTS). 바꾸는 행만 label_original = 옛 label.
--   - DELETE·DROP·타입 축소 없음. 다른 열·다른 행은 건드리지 않는다(WHERE = id ∧ 현재 label = 옛 값 ∧ label_original IS NULL).
--   - label 은 어떤 UNIQUE·인덱스·커서·지문·멱등 키에도 들어가지 않는다(감사: 드라이런 §3).
--     UNIQUE 는 (project_id, source_key, product_ref)(20260829000003:127-128) 하나뿐이다.
-- 멱등: 재실행하면 이미 바뀐 행은 WHERE 에 안 걸려 0행 갱신, 끝의 DO 블록이 최종 상태(58행 전부 새 label ∧
--   label_original = 옛 label)를 다시 확인한다. 옛 값도 새 값도 아닌 행이 있으면(그 사이 누가 고쳤다) RAISE → 롤백.
-- 롤백: 20261008000010_review_targets_label_normalize_rollback.sql (label_original 에서 복원, 열은 남김).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 남헌 승인 뒤 오케스트레이터.
--   §10.2 예외 2번(대량 UPDATE) 해당 여부: 58행 label 한 열·원본 보존·롤백 동반 — 4조건(드라이런·롤백·무중단·Notion) 기록 필요.
--   절차: 1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 아래 '적용 전' 쿼리 3) 실행 4) 하단 확인 쿼리 5) docs/migration-exceptions.md 기입
-- ============================================================

-- ── 적용 전 확인(information_schema·직접 SELECT — PostgREST head:true 금지, §7.1) ──
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='review_targets' AND column_name='label_original';   -- 기대: 0(재실행이면 1)
--   SELECT count(*) FROM public.review_targets WHERE label ~ '^[0-9]{2}-';                           -- 기대: 84(드라이런 입력과 같음)
--   SELECT count(*) FILTER (WHERE label ~ '^01-') AS m01, count(*) FILTER (WHERE label ~ '^07-') AS e07
--     FROM public.review_targets;                                                                     -- 기대: 56 · 28
--   -- 같은 프로젝트에 이미 새 형식 라벨이 섞여 있는지(정규화 뒤 prefilter areaOfProject 가 'mixed' 가 되는지):
--   SELECT project_id, array_agg(DISTINCT label) FROM public.review_targets
--    WHERE project_id IN (SELECT project_id FROM public.review_targets WHERE label ~ '^0[17]-')
--      AND label !~ '^0[17]-' GROUP BY 1;                                                             -- 참고(0행 기대 — 있으면 드라이런 §3 에 적고 진행 여부 판단)

BEGIN;

ALTER TABLE public.review_targets ADD COLUMN IF NOT EXISTS label_original text NULL;
COMMENT ON COLUMN public.review_targets.label_original IS
  'T0 라벨 정규화(20261008000010) 전 원래 label. 정규화로 바뀐 행에만 채운다. 롤백 SQL 이 이 값으로 label 을 되돌린다.';

CREATE TEMP TABLE _t0_map (id uuid PRIMARY KEY, source_key text NOT NULL, old_label text NOT NULL, new_label text NOT NULL) ON COMMIT DROP;

INSERT INTO _t0_map (id, source_key, old_label, new_label) VALUES
  ('9ed187b2-7100-4b08-a56d-4b73149624ee'::uuid, 'appstore', '01-meeting-notes:adot', '1:adot'),
  ('7a8996d5-ed2f-4558-a826-dd06ce6d1e12'::uuid, 'googleplay', '01-meeting-notes:adot', '1:adot'),
  ('3e27b97a-51a4-46b1-a216-1f77b1354f63'::uuid, 'appstore', '01-meeting-notes:avoma', '1:avoma'),
  ('2f8e8631-769d-4212-9e36-cdf7598252fc'::uuid, 'googleplay', '01-meeting-notes:avoma', '1:avoma'),
  ('a03d42b8-bd1c-4609-904a-308a4afb3403'::uuid, 'appstore', '01-meeting-notes:bluedot', '1:bluedot'),
  ('85457838-262e-447c-a9a8-144d625fbb6b'::uuid, 'googleplay', '01-meeting-notes:bluedot', '1:bluedot'),
  ('b4109e76-745b-48cc-b67d-6fb86286696d'::uuid, 'appstore', '01-meeting-notes:callabo', '1:callabo'),
  ('0cf9129c-b3b2-4ec7-8504-cc0f73c0a951'::uuid, 'googleplay', '01-meeting-notes:callabo', '1:callabo'),
  ('7da3e4b4-abea-48de-9870-37724d3a43f5'::uuid, 'googleplay', '01-meeting-notes:callog', '1:callog'),
  ('edce8b2b-e69a-405e-a13b-c40ab69c2f7c'::uuid, 'appstore', '01-meeting-notes:circleback', '1:circleback'),
  ('bea4dea8-b0f7-4343-9d04-ee507e8f73e4'::uuid, 'googleplay', '01-meeting-notes:circleback', '1:circleback'),
  ('390b32ad-a86e-4044-b9c3-9e17007f3d1f'::uuid, 'appstore', '01-meeting-notes:clova-note', '1:clova-note'),
  ('34b6c17a-914e-4f99-9521-df309d5a8559'::uuid, 'googleplay', '01-meeting-notes:clova-note', '1:clova-note'),
  ('d390ef97-49cc-4ea1-b739-2ad712053841'::uuid, 'appstore', '01-meeting-notes:daglo', '1:daglo'),
  ('914bcf4d-649c-4041-86bf-0cb3b73e9f1c'::uuid, 'googleplay', '01-meeting-notes:daglo', '1:daglo'),
  ('63b75d14-8dfc-4971-b469-14175ee14193'::uuid, 'appstore', '01-meeting-notes:fathom', '1:fathom'),
  ('9b8ef541-4343-400a-9082-5c8a4b91b1c5'::uuid, 'appstore', '01-meeting-notes:fellow', '1:fellow'),
  ('b56092b8-a5cd-430b-b63d-d4b46ecb97bc'::uuid, 'googleplay', '01-meeting-notes:fellow', '1:fellow'),
  ('19bc2c00-2518-448f-9cfe-7073704d927d'::uuid, 'appstore', '01-meeting-notes:fireflies-ai', '1:fireflies-ai'),
  ('9468b0ea-5df2-4a9d-b80a-9949dd80a5d9'::uuid, 'googleplay', '01-meeting-notes:fireflies-ai', '1:fireflies-ai'),
  ('d1622847-8988-4d21-b389-7969a484e4ac'::uuid, 'appstore', '01-meeting-notes:granola', '1:granola'),
  ('404123b9-3ba0-487f-8e48-15f7b175d215'::uuid, 'googleplay', '01-meeting-notes:granola', '1:granola'),
  ('8c819671-3158-41f8-ad17-d66c5afaea50'::uuid, 'googleplay', '01-meeting-notes:us-en|granola', '1:us-en|granola'),
  ('fb61b71c-7e00-4814-9414-2cc82970138f'::uuid, 'appstore', '01-meeting-notes:hoirock', '1:hoirock'),
  ('2fd10519-85d1-4f3d-badd-eee86dc4f9c3'::uuid, 'googleplay', '01-meeting-notes:hoirock', '1:hoirock'),
  ('c6875e78-1706-4e7f-b102-0c2c6d771886'::uuid, 'appstore', '01-meeting-notes:ixio', '1:ixio'),
  ('65393347-5555-4c8c-883e-547687bae24d'::uuid, 'googleplay', '01-meeting-notes:ixio', '1:ixio'),
  ('fd75779f-d0b2-423d-abe2-db34f7a110a1'::uuid, 'appstore', '01-meeting-notes:jamie', '1:jamie'),
  ('f397e8f6-4dc4-458a-b3a3-68c774c65a6b'::uuid, 'googleplay', '01-meeting-notes:jamie', '1:jamie'),
  ('998e297a-9af5-4368-a9bc-a485ee8d7354'::uuid, 'appstore', '01-meeting-notes:krisp', '1:krisp'),
  ('c66f3f63-2bc7-43b3-9271-cd51630c974b'::uuid, 'googleplay', '01-meeting-notes:krisp', '1:krisp'),
  ('8e9d98da-eca5-4725-9946-270a5aae347d'::uuid, 'appstore', '01-meeting-notes:meetgeek', '1:meetgeek'),
  ('be04065f-5a32-4fb9-8e46-a70a6f01eaa1'::uuid, 'googleplay', '01-meeting-notes:meetgeek', '1:meetgeek'),
  ('d1b3ca55-898e-41da-ac72-84382b972cdc'::uuid, 'googleplay', '01-meeting-notes:meeting-os', '1:meeting-os'),
  ('0715fe6d-0042-4e75-969c-d7a41b558baa'::uuid, 'googleplay', '01-meeting-notes:us-en|meeting-os', '1:us-en|meeting-os'),
  ('a034084b-4e31-445a-9f4c-d7b1568c28cc'::uuid, 'appstore', '01-meeting-notes:notta', '1:notta'),
  ('0625893b-768f-4a3b-9062-452074b1d27e'::uuid, 'googleplay', '01-meeting-notes:notta', '1:notta'),
  ('68e23c87-23de-4dc3-a70a-2b8e6b0fb944'::uuid, 'appstore', '01-meeting-notes:otter-ai', '1:otter-ai'),
  ('06864918-a985-4ed0-8090-6656cdce135b'::uuid, 'googleplay', '01-meeting-notes:otter-ai', '1:otter-ai'),
  ('c8c4c905-15c1-4944-94d6-9e87c55bc6bb'::uuid, 'appstore', '01-meeting-notes:plaud', '1:plaud'),
  ('11ec12ba-b4b3-44af-b046-cae12a6802a0'::uuid, 'googleplay', '01-meeting-notes:plaud', '1:plaud'),
  ('22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974'::uuid, 'appstore', '01-meeting-notes:read-ai', '1:read-ai'),
  ('d69b4673-7b7c-4927-8689-59d8b5b0775c'::uuid, 'googleplay', '01-meeting-notes:read-ai', '1:read-ai'),
  ('44be035e-cead-4b5b-920b-6594743ba0b9'::uuid, 'googleplay', '01-meeting-notes:us-en|read-ai', '1:us-en|read-ai'),
  ('e15e20ea-d45b-4116-ac4f-bb87699b28b8'::uuid, 'appstore', '01-meeting-notes:remember-note', '1:remember-note'),
  ('d8218846-5cfb-42e3-b279-97b1de4db7da'::uuid, 'googleplay', '01-meeting-notes:remember-note', '1:remember-note'),
  ('35b22aad-759f-4e5e-a21d-6684fe11090e'::uuid, 'appstore', '01-meeting-notes:rev', '1:rev'),
  ('07a34412-60f2-418f-83f9-cc94a6805c8f'::uuid, 'googleplay', '01-meeting-notes:rev', '1:rev'),
  ('6171147e-7ce9-4ce8-90b9-6efee8a5ff44'::uuid, 'appstore', '01-meeting-notes:sembly-ai', '1:sembly-ai'),
  ('ea464383-0e53-4ca4-92a4-525b6ece65d1'::uuid, 'googleplay', '01-meeting-notes:sembly-ai', '1:sembly-ai'),
  ('28f43a50-9670-470b-aa45-b1ebba736b22'::uuid, 'appstore', '01-meeting-notes:tiro', '1:tiro'),
  ('d3d6c4a3-3486-4126-82ca-c740e75e79f1'::uuid, 'googleplay', '01-meeting-notes:tiro', '1:tiro'),
  ('e2ba601b-b251-4380-beaa-ecb615e56c74'::uuid, 'appstore', '01-meeting-notes:tldv', '1:tldv'),
  ('48ef8d40-2441-4f52-a94a-895da9ecdbb1'::uuid, 'googleplay', '01-meeting-notes:tldv', '1:tldv'),
  ('ad719988-da5e-4bb2-8110-de8af6d0e239'::uuid, 'googleplay', '01-meeting-notes:us-en|tldv', '1:us-en|tldv'),
  ('55ebf8aa-a3c7-4467-b238-edcf878e00c2'::uuid, 'appstore', '07-ecommerce-ops:triple-whale', '3:triple-whale'),
  ('7460dec5-43a3-4858-8378-0ed61bb41b90'::uuid, 'googleplay', '07-ecommerce-ops:triple-whale', '3:triple-whale'),
  ('793fb4ee-707b-4040-9be0-663b0034aaf6'::uuid, 'googleplay', '01-meeting-notes:vito', '1:vito');

CREATE TEMP TABLE _t0_done (id uuid) ON COMMIT DROP;

WITH upd AS (
  UPDATE public.review_targets t
     SET label_original = t.label,
         label = m.new_label
    FROM _t0_map m
   WHERE t.id = m.id
     AND t.source_key = m.source_key
     AND t.label = m.old_label
     AND t.label_original IS NULL
  RETURNING t.id
)
INSERT INTO _t0_done SELECT id FROM upd;

DO $$
DECLARE
  expected CONSTANT int := 58;
  cand int; done_n int; ok_n int; bad_fmt int; clash int;
BEGIN
  SELECT count(*) INTO cand FROM _t0_map;
  IF cand <> expected THEN RAISE EXCEPTION '대상 %행(기대 %)', cand, expected; END IF;

  -- ① 최종 상태: 58행 전부 새 label ∧ label_original = 옛 label (이번 실행이든 지난 실행이든)
  SELECT count(*) INTO ok_n FROM public.review_targets t JOIN _t0_map m ON m.id = t.id
   WHERE t.label = m.new_label AND t.label_original = m.old_label AND t.source_key = m.source_key;
  IF ok_n <> expected THEN
    RAISE EXCEPTION '정규화 상태 %행(기대 %) — 행이 없거나 label 이 옛 값·새 값 어느 쪽도 아니다(그 사이 변경)', ok_n, expected;
  END IF;

  -- ② 새 label 이 영역 판독 정규식(target-supply.ts areaOf)에 걸린다
  SELECT count(*) INTO bad_fmt FROM _t0_map WHERE new_label !~ '^[1-5]:';
  IF bad_fmt <> 0 THEN RAISE EXCEPTION 'new_label % 개가 ^[1-5]: 형식이 아니다', bad_fmt; END IF;

  -- ③ 변경 후 (source_key, label) 중복 — 제약은 없지만 드라이런 기대 0. 다르면 멈추고 본다.
  SELECT count(*) INTO clash FROM (
    SELECT t.source_key, t.label FROM public.review_targets t
     WHERE (t.source_key, t.label) IN (SELECT source_key, new_label FROM _t0_map)
     GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF clash <> 0 THEN RAISE EXCEPTION '변경 후 (source_key, label) 중복 %쌍 — 드라이런 기대 0', clash; END IF;

  SELECT count(*) INTO done_n FROM _t0_done;
  RAISE NOTICE 'T0 라벨 정규화: 대상 % · 이번 실행 갱신 % · 최종 확인 %', cand, done_n, ok_n;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT count(*) FROM public.review_targets WHERE label_original IS NOT NULL;                         -- 기대: 58
-- SELECT split_part(label, ':', 1) AS area, count(*) FROM public.review_targets
--  WHERE label_original IS NOT NULL GROUP BY 1 ORDER BY 1;                                              -- 기대: 1=56 · 3=2
-- SELECT count(*) FROM public.review_targets WHERE label ~ '^01-';                                      -- 기대: 0
-- SELECT count(*) FROM public.review_targets WHERE label ~ '^07-';                                      -- 기대: 26(지도 out — 의도된 보류)
-- SELECT count(*) FROM public.review_targets WHERE label_original IS NOT NULL AND label !~ '^[1-5]:';   -- 기대: 0
-- 음성(다른 행 불변):
--   적용 전: SELECT count(*), md5(string_agg(id::text || '|' || coalesce(label, ''), ',' ORDER BY id)) FROM public.review_targets
--             WHERE coalesce(label, '') !~ '^01-' AND coalesce(label, '') <> '07-ecommerce-ops:triple-whale';
--   적용 후: SELECT count(*), md5(string_agg(id::text || '|' || coalesce(label, ''), ',' ORDER BY id)) FROM public.review_targets
--             WHERE label_original IS NULL;                                                         -- 기대: 적용 전 두 값과 똑같다
-- BEGIN; UPDATE public.review_targets SET status='nope' WHERE label_original IS NOT NULL; ROLLBACK;  -- 기대: 23514 review_targets_status_check(열 추가가 제약을 안 건드림)
-- 운영 확인: 다음 `node scripts/target-supply.mjs` 출력의 "영역 활성" 1·3 이 늘고 unmapped 가 준다.
