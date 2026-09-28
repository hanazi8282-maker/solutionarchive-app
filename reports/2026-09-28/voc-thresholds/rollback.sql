-- dryrun-update.sql 되돌리기. 2026-09-28 스냅샷(SELECT 로 채집)의 verdict·verdict_reason 원값.
-- ⛔ 실행하지 않은 초안이다. dryrun-update.sql 을 적용한 뒤에만 의미가 있다.

begin;

with v(id, verdict, verdict_reason) as (values
  ('b8180fad-6432-4689-9b0d-d54344547e98'::uuid, 'rejected', 'oversized_voc: 12129 > 500'),
  ('8518082d-a662-41c6-9b30-6093fa97a895'::uuid, 'rejected', 'oversized_voc: 6330 > 500'),
  ('a29d740e-fc05-48a9-a4e3-794d07d275d7'::uuid, 'rejected', 'oversized_voc: 45354 > 500'),
  ('6fd37303-96f8-4025-a043-26898bb096df'::uuid, 'accepted', 'voc_ok: 191 hits'),
  ('f60410c0-7520-4569-b43a-a430c9912ccc'::uuid, 'rejected', 'oversized_voc: 3576 > 500'),
  ('636a50c7-399c-4ed1-b62f-914b556a0ed4'::uuid, 'rejected', 'oversized_voc: 10555 > 500'),
  ('d8472872-927c-444a-8e0f-5885b306c2b3'::uuid, 'rejected', 'oversized_voc: 3599 > 500'),
  ('a9289caa-474a-477f-b27d-73fd4265a99f'::uuid, 'rejected', 'oversized_voc: 18910 > 500'),
  ('80c50014-fef9-48ee-a61e-e9e33851e584'::uuid, 'rejected', 'oversized_voc: 2212 > 500'),
  ('953000e0-50d2-4b4e-bb58-0238b42fd97f'::uuid, 'accepted', 'voc_ok: 61 hits'),
  ('a786c486-88cb-4252-a5f7-ab0b6b81edb7'::uuid, 'accepted', 'voc_ok: 103 hits'),
  ('d0967a8e-dfd5-4815-8194-383189359fee'::uuid, 'rejected', 'oversized_voc: 4559 > 500'),
  ('0ecebde2-0b12-4372-b5cc-98c00d439f71'::uuid, 'rejected', 'oversized_voc: 1131 > 500'),
  ('a2b8dfb8-6710-4830-93f1-eb6786edf233'::uuid, 'rejected', 'oversized_voc: 4015 > 500'),
  ('cbfbd895-c7f0-48c7-8b40-e33da8ad4022'::uuid, 'accepted', 'voc_ok: 168 hits'),
  ('d5ba81f1-497a-4533-a069-5dc14e61c38e'::uuid, 'rejected', 'oversized_voc: 1025 > 500'),
  ('3f473173-788e-468b-9315-ec58bd09b3d8'::uuid, 'rejected', 'oversized_voc: 862 > 500'),
  ('4f2a3e18-2972-49ba-a16b-d150d682d99e'::uuid, 'rejected', 'oversized_voc: 2415 > 500'),
  ('23fd0bc1-c4ad-4cbc-92b7-fdfcd4b8a8b2'::uuid, 'rejected', 'oversized_voc: 4011 > 500'),
  ('b1552532-c6b1-47dd-a4d2-7f330af77c10'::uuid, 'rejected', 'oversized_voc: 38548 > 500'),
  ('9de5961d-7ee1-4957-afc2-060341160970'::uuid, 'rejected', 'oversized_voc: 5876 > 500'),
  ('cf36d71c-a82c-4f94-8584-92933abfcd3c'::uuid, 'rejected', 'oversized_voc: 9204 > 500'),
  ('824ebbcf-c02c-4aaf-98da-bfe85a6136c0'::uuid, 'accepted', 'voc_ok: 135 hits'),
  ('4d192f6e-6dd7-4cff-bde4-300827d66d08'::uuid, 'rejected', 'oversized_voc: 743 > 500'),
  ('7f8d059e-4ad1-48eb-8a01-0218fc65943a'::uuid, 'accepted', 'voc_ok: 168 hits'),
  ('1ad57af4-2b47-43cd-9aa8-b942e71618c6'::uuid, 'accepted', 'voc_ok: 141 hits'),
  ('348f410f-0586-4775-89a2-28f6d747fcfc'::uuid, 'accepted', 'voc_ok: 60 hits'),
  ('bfe58169-00bc-4a6b-a7b2-66b28640c791'::uuid, 'accepted', 'voc_ok: 31 hits'),
  ('5cee5385-b4f1-4136-998b-eae2118c4bad'::uuid, 'accepted', 'voc_ok: 93 hits')
)
update discovery_candidates d
   set verdict = v.verdict, verdict_reason = v.verdict_reason
  from v
 where d.id = v.id
   and d.verdict_reason like '%(reclass 2026-09-28%';   -- 재분류가 들어간 행만

-- 확인: 0 이어야 한다.
select count(*) as still_reclassed from discovery_candidates where verdict_reason like '%(reclass 2026-09-28%';

-- commit;  -- 위 숫자가 0 일 때만
