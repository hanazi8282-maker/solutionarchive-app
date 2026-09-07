-- 20260907000002_backfill_observation_keys_rollback.sql
--
-- 20260907000002 백필의 롤백. 그 마이그가 UPDATE 한 71행의
-- observation_key / supports_metric 를 NULL 로 되돌린다 (= 백필 전 상태).
--
-- ⚠️ 이 두 컬럼은 백필 스크립트 말고 아무도 쓰지 않는다(2026-09-07 기준). 그래도
--    안전하게 백필 대상 id 만 지정한다 — 나중에 다른 경로로 채운 행이 생겨도 안 건드리게.
-- ⚠️ 롤백 후에는 등급이 다시 잠정 상태가 된다. case-review.mjs regrade --dry --force 로만
--    투영을 볼 수 있고, 스키마(20260907000001)까지 되돌리려면 그 파일의 롤백을 별도로 돌린다.
-- ⚠️ 적용은 대시보드 SQL Editor 에서 사람이 직접(§12-5).

BEGIN;

UPDATE public.case_evidence
   SET observation_key = NULL,
       supports_metric = NULL
 WHERE id IN (
   '8c4eb842-42bc-490f-b051-71817579115c',
   '6e49f997-8768-4957-9320-8ad2509d0148',
   'ebcbc7c8-9b18-45d0-9a3f-c1a21bf16461',
   '1553a883-fdae-40d9-acd1-ac05fa58d3a2',
   'afd7e22e-cdd9-47b6-a28c-4b4c83de4755',
   '568c481d-0d96-4c96-b5ae-8285e7d07b7e',
   '110cc0f3-6a15-4e4e-a4e1-fb27a7fba037',
   '8d6fcbef-1c24-4eb0-99b3-0dbddfa1824b',
   '4d9abdc6-86a4-4236-83c3-dfe12052ec92',
   '375133fa-52da-484e-9906-516197027d08',
   '494ead5f-2511-4528-930c-5a5d3cdc9d04',
   'd724efa5-79cd-4d42-8299-f20242776792',
   'cc83cf5b-86d3-408d-bfc5-13b0229e77b7',
   'ce5916e4-fe8c-41d3-a97a-9cc1362d2ff4',
   '8d29c62b-9a9b-4891-8e63-f883b106911b',
   'c47cfd56-8807-47bd-9058-3520ce97bd6e',
   'd24efe41-4ab4-4318-aec2-938d7e0357aa',
   '4b9ac117-2579-4a31-84ba-3565c77ff8cb',
   '5c065636-e33c-4233-b4ff-9c4186ec708e',
   'a2127583-e877-4914-99a5-6151eb005256',
   '26506d16-b227-4553-8bd0-107ed3127664',
   'd8254b05-e397-4823-b1b8-cf0dc3498d3c',
   '065eb790-7de0-43d7-bd6a-0bd1a26bc4ad',
   '42ffcb12-2a08-4bd5-bd52-ff05aa3224dd',
   'e2010b09-de21-4214-ac48-d045e91b0a3a',
   'd4403676-d52d-4b65-86c6-a86197bfe0f4',
   '59bebec2-a364-43f2-a96a-5f302c5e69e9',
   '2d68117d-a58c-45d3-83d2-32acdbd39138',
   'c2ff198e-6086-4c1d-81d6-7556ec393c32',
   '9ac6a7dd-bb54-4c62-a91f-c73e9966eec9',
   'c86384f4-717c-4e69-b007-18465f731ff1',
   '68a8fc40-e329-4a75-9d61-83a965e892bd',
   'b38252c9-665d-4283-b02f-56f45dea3112',
   'f28f4366-6b3c-4b07-913f-36fad76b3776',
   '16fc4516-fbc6-4f0a-84b4-2ea6abf26ce5',
   '4366ec0d-ca86-4956-8166-9630ab83dba1',
   'c518b174-a862-44c6-b143-1b7cfe0c6670',
   '22ccd281-a6d0-4e77-992a-0aff9a96125c',
   '06d5314f-aeb3-49c3-9aab-e36928ec93a4',
   '0b2378c2-23ea-4b5c-9efb-104943526acc',
   '27c83e06-2ba4-4ae8-bf29-66109de040e6',
   'a55e191a-85a1-4b43-96ed-cf9bfaf043fd',
   'e5b49e34-7600-40d5-85bc-3f1ee32b4d4b',
   '04e4a709-410f-4778-9b7d-e9d7ee8ab266',
   '9576ac4f-7e2e-4c7e-9f7d-907868bcf3b3',
   'a03f6c60-5c0b-4c1e-abcd-b1dfc8111ec0',
   '2a127180-c5c2-4457-9c27-c9964f538c2a',
   '73492414-6a5a-404a-a6aa-d8589c0432f4',
   '912103ee-d825-49f8-aa99-97863268a051',
   'e85795c9-365b-42a3-87a4-df44ac191eb4',
   '1379db3d-70b6-4f53-a55d-2b6dd6cb09ed',
   '256e84ad-b2e1-4fb5-874f-1d4e10f379d9',
   '6a1687df-0136-4af2-bd98-604ab8e6a20a',
   'f047e103-40a3-4c03-979d-6d8fedff8e8f',
   'e8b6197e-dc83-44ed-8071-87de970e699f',
   'e1ac4c86-9c02-4f48-a18a-070dbdd629cc',
   '4262faf0-ca0f-4949-8375-8d725ff6dcfd',
   'c2755050-8548-4970-af3d-738b71ca521f',
   '1901e2ac-47c1-477a-925f-39174ce31fcf',
   '0225b7b2-2a20-45d8-8d07-d2c4ab7b3bb1',
   'fc709fc7-4eca-4225-9701-195da717e502',
   '78c1b20f-8e39-4ba2-a631-f48be28bc14e',
   '67cec6ae-7391-4e62-b20f-032fabf047e8',
   '7a582a9c-0c11-4c5b-9ec8-d6b994b307fe',
   '5c401868-0e49-4ffb-a22c-ce980415087d',
   '06a40d4f-ecf2-4373-816c-dac4223d1f56',
   '0484a126-6aec-4644-9072-f98308246212',
   '2b45fb2b-2f09-4f7d-a3cc-b9baa9b37805',
   '7004fce2-b467-423c-a0a9-1a598dfed05e',
   '42f17ce4-868a-4dae-8536-6a63d83ebd6d',
   '842475ae-66f5-4f02-8701-465d410a25e5'
 );

-- 되돌린 행: 71 (백필에서 observation_key 를 매긴 67행 + supports_metric=false 만 적은 서사 행)

COMMIT;

-- 적용 후 확인:
--   node --env-file=.env.local scripts/case-pipeline-verify.mjs --probe
--     기대: 관측 키 커버리지 0/72, 컬럼은 존재(20260907000001 은 안 되돌림), exit 0
