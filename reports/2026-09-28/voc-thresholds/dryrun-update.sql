-- VOC 개수 기준 변경(남헌 2026-09-28) — discovery_candidates 재분류 UPDATE 초안.
-- ⛔ 실행하지 않은 초안이다. 오케스트레이터가 검토한 뒤에만 돌린다(§10.2 대량 UPDATE 4조건).
-- 새 기준: 200 이상 50,000 미만 = 정상(accepted) / 200 미만 = inefficient / 50,000 이상 = oversize.
-- 대상: 판정이 바뀌는 29행(살아남 19 · 걸러짐 10). 되돌리기: rollback.sql
--
-- 제외(의도):
--   - 오랄비 전동칫솔(963b08e8…) 999+ 캡값 → 새 기준에서 unverified 지만, CHECK
--     unverified_has_no_project 때문에 project_id 가 있는 행은 unverified 로 못 바꾼다. 그대로 둔다.
--   - 판정이 안 바뀌는 11행(사유 문자열의 옛 숫자만 다름)은 건드리지 않는다.
-- 주의:
--   - 살아나는 19행은 accepted 가 되지만 project_id·review_targets 가 없다. 수집은 안 붙는다.
--     실제로 수집하려면 등록 경로(analysis_projects + review_targets)를 따로 밟아야 한다.
--     이 중 5행(Fly.io·Superhuman·Metabase·Retool·Tailscale)은 human_review='killed' 다.
--   - 걸러지는 10행은 rejected 가 되지만 기존 project_id·수집 데이터는 그대로 남는다.
--     rejected 에는 project_id 금지 CHECK 가 없어 제약 위반은 없다.
--   - human_review 는 건드리지 않는다.

begin;

with v(id, new_verdict, new_reason, old_verdict) as (values
  ('b8180fad-6432-4689-9b0d-d54344547e98'::uuid, 'accepted', 'voc_ok: 12129 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('8518082d-a662-41c6-9b30-6093fa97a895'::uuid, 'accepted', 'voc_ok: 6330 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('a29d740e-fc05-48a9-a4e3-794d07d275d7'::uuid, 'accepted', 'voc_ok: 45354 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('6fd37303-96f8-4025-a043-26898bb096df'::uuid, 'rejected', 'insufficient_voc: 191 < 200 (reclass 2026-09-28)', 'accepted'),
  ('f60410c0-7520-4569-b43a-a430c9912ccc'::uuid, 'accepted', 'voc_ok: 3576 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('636a50c7-399c-4ed1-b62f-914b556a0ed4'::uuid, 'accepted', 'voc_ok: 10555 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('d8472872-927c-444a-8e0f-5885b306c2b3'::uuid, 'accepted', 'voc_ok: 3599 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('a9289caa-474a-477f-b27d-73fd4265a99f'::uuid, 'accepted', 'voc_ok: 18910 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('80c50014-fef9-48ee-a61e-e9e33851e584'::uuid, 'accepted', 'voc_ok: 2212 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('953000e0-50d2-4b4e-bb58-0238b42fd97f'::uuid, 'rejected', 'insufficient_voc: 61 < 200 (reclass 2026-09-28)', 'accepted'),
  ('a786c486-88cb-4252-a5f7-ab0b6b81edb7'::uuid, 'rejected', 'insufficient_voc: 103 < 200 (reclass 2026-09-28)', 'accepted'),
  ('d0967a8e-dfd5-4815-8194-383189359fee'::uuid, 'accepted', 'voc_ok: 4559 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('0ecebde2-0b12-4372-b5cc-98c00d439f71'::uuid, 'accepted', 'voc_ok: 1131 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('a2b8dfb8-6710-4830-93f1-eb6786edf233'::uuid, 'accepted', 'voc_ok: 4015 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('cbfbd895-c7f0-48c7-8b40-e33da8ad4022'::uuid, 'rejected', 'insufficient_voc: 168 < 200 (reclass 2026-09-28)', 'accepted'),
  ('d5ba81f1-497a-4533-a069-5dc14e61c38e'::uuid, 'accepted', 'voc_ok: 1025 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('3f473173-788e-468b-9315-ec58bd09b3d8'::uuid, 'accepted', 'voc_ok: 862 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('4f2a3e18-2972-49ba-a16b-d150d682d99e'::uuid, 'accepted', 'voc_ok: 2415 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('23fd0bc1-c4ad-4cbc-92b7-fdfcd4b8a8b2'::uuid, 'accepted', 'voc_ok: 4011 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('b1552532-c6b1-47dd-a4d2-7f330af77c10'::uuid, 'accepted', 'voc_ok: 38548 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('9de5961d-7ee1-4957-afc2-060341160970'::uuid, 'accepted', 'voc_ok: 5876 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('cf36d71c-a82c-4f94-8584-92933abfcd3c'::uuid, 'accepted', 'voc_ok: 9204 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('824ebbcf-c02c-4aaf-98da-bfe85a6136c0'::uuid, 'rejected', 'insufficient_voc: 135 < 200 (reclass 2026-09-28)', 'accepted'),
  ('4d192f6e-6dd7-4cff-bde4-300827d66d08'::uuid, 'accepted', 'voc_ok: 743 hits (reclass 2026-09-28: 200 이상 50000 미만)', 'rejected'),
  ('7f8d059e-4ad1-48eb-8a01-0218fc65943a'::uuid, 'rejected', 'insufficient_voc: 168 < 200 (reclass 2026-09-28)', 'accepted'),
  ('1ad57af4-2b47-43cd-9aa8-b942e71618c6'::uuid, 'rejected', 'insufficient_voc: 141 < 200 (reclass 2026-09-28)', 'accepted'),
  ('348f410f-0586-4775-89a2-28f6d747fcfc'::uuid, 'rejected', 'insufficient_voc: 60 < 200 (reclass 2026-09-28)', 'accepted'),
  ('bfe58169-00bc-4a6b-a7b2-66b28640c791'::uuid, 'rejected', 'insufficient_voc: 31 < 200 (reclass 2026-09-28)', 'accepted'),
  ('5cee5385-b4f1-4136-998b-eae2118c4bad'::uuid, 'rejected', 'insufficient_voc: 93 < 200 (reclass 2026-09-28)', 'accepted')
)
update discovery_candidates d
   set verdict = v.new_verdict, verdict_reason = v.new_reason
  from v
 where d.id = v.id
   and d.verdict = v.old_verdict;   -- 스냅샷 뒤에 바뀐 행은 건드리지 않는다

-- 확인: 29 가 아니면 rollback; 하고 원인을 본다.
select count(*) as reclassed from discovery_candidates where verdict_reason like '%(reclass 2026-09-28%';

-- commit;  -- 위 숫자가 29 일 때만
