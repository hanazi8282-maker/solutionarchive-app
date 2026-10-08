-- ============================================================
-- 20261008000010_review_targets_label_normalize_rollback
--
-- 정방향(20261008000010)을 되돌린다: label_original 에서 label 을 복원하고 label_original 을 NULL 로 비운다.
-- 열 label_original 은 남긴다(DROP COLUMN 은 §10.2 예외 1번 — 하지 않는다). 비운 열이 남아도 읽는 코드는 없다.
--
-- 대상은 정방향 VALUES 와 같은 58개 id ∧ 현재 label = 정방향이 쓴 새 값인 행만.
--   그 뒤 누가 label 을 또 바꿨으면 덮어쓰지 않고 NOTICE 로 알린다(stray).
-- 재실행 안전: 이미 복원된 행은 label_original IS NULL 이라 WHERE 에 안 걸린다.
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다.
-- 야간 수집(nightly-review-collect) 시간대를 피해 적용한다(lock_timeout 5s).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

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

CREATE TEMP TABLE _t0_undone (id uuid) ON COMMIT DROP;

WITH upd AS (
  UPDATE public.review_targets t
     SET label = t.label_original,
         label_original = NULL
    FROM _t0_map m
   WHERE t.id = m.id
     AND t.label = m.new_label
     AND t.label_original = m.old_label
  RETURNING t.id
)
INSERT INTO _t0_undone SELECT id FROM upd;

DO $$
DECLARE undone int; restored int; stray int;
BEGIN
  SELECT count(*) INTO undone FROM _t0_undone;
  SELECT count(*) INTO restored FROM public.review_targets t JOIN _t0_map m ON m.id = t.id
   WHERE t.label = m.old_label AND t.label_original IS NULL;
  SELECT count(*) INTO stray FROM public.review_targets t JOIN _t0_map m ON m.id = t.id
   WHERE NOT (t.label = m.old_label AND t.label_original IS NULL);
  IF stray <> 0 THEN RAISE NOTICE '복원 못 한 행 %개 — label 이 정방향 새 값과 다르다(그 뒤 변경). 손으로 확인', stray; END IF;
  RAISE NOTICE 'T0 롤백: 이번 실행 복원 % · 옛 label 상태 % / 58', undone, restored;
END $$;

COMMIT;

-- 확인:
-- SELECT count(*) FROM public.review_targets WHERE label_original IS NOT NULL;   -- 기대: 0
-- SELECT count(*) FROM public.review_targets WHERE label ~ '^0[17]-';            -- 기대: 84
