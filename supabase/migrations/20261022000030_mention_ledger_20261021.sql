-- 20261022000030_mention_ledger_20261021.sql — 언급 루프 대장 2026-10-21 (v71ba P0-1, scripts/mention-ledger-migrate.mjs 가 아티팩트 mention-ledger.sql 을 감쌌다)
-- discovery_candidates origin='mention' 14행 INSERT(같은 이름이 있으면 언급 행만 집계 칸 갱신 — HN 발굴·accepted·새 출시 입력 행은 안 덮음).
-- 🟢 비파괴: INSERT … ON CONFLICT 가드 갱신만. DELETE·DDL 없음. §10.1 발굴 적재(discovery_candidates 전체) 범위.
-- ⚠️ 미적용 초안 — 적용은 오케스트레이터(§10.2). 근거 글 id 만 있고 원문 조각은 없다.
-- 롤백: 20261022000030_mention_ledger_20261021_rollback.sql

BEGIN;

-- 언급 루프 대장 2026-10-21 — discovery_candidates(origin='mention'). 사람·역할 세션이 적용. HN 발굴 행(origin NULL)은 ON CONFLICT 에서 건드리지 않는다.
INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, mention_count, post_count, source_count, alt_seek_posts, evidence_input_ids, area_code, area_fit, gate_blocked, last_seen_at)
VALUES
  ('saas', 'ADP', '리뷰 속 언급 3글·1소스(역할 from 2/to 0/alt 0/compare 1)', NULL, NULL, NULL, 'unverified', 'lookup_failed: 앱 ID 없음 — 이름 검색(itunes /search)은 robots 금지 경로라 사람 판단 대기', 'mention', 3, 3, 1, 0, ARRAY['001856b9-452e-49d7-9816-836d910769d0', '10686d87-9706-4877-b7b1-08991a0e27af', '25d2f0d6-1d65-4964-b94c-6eb3fb85af89']::uuid[], '4', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'production', '리뷰 속 언급 4글·3소스(역할 from 0/to 3/alt 0/compare 1)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 1)', 'mention', 4, 4, 3, 1, ARRAY['02523d95-ac0b-40b4-b351-aae15b99add5', '3a0fa278-1a13-4cf9-9770-2fca1f893e58', '55cd780e-5241-456a-a342-4fa21960d74e', '56dad9e3-a695-466d-b861-5fd2300f5d6c']::uuid[], 'out-founder', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'Raindrop', '리뷰 속 언급 12글·1소스(역할 from 0/to 12/alt 0/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 1)', 'mention', 12, 12, 1, 1, ARRAY['035f089c-0df9-4639-b404-dbaf72f8023c', '0cedac51-cbc0-4ced-b5a6-f43efe42b319', '1ded14f1-e589-4b85-a978-240bd82fffd4', '239c8085-65d7-4b4a-8874-b6405ffa13bc', '2aa4774f-57e0-4211-adbf-3a87f71d652e', '2bb18438-38b6-4eef-824e-28f6f9e6cf09', '41d6ed03-db3a-4436-950e-b9785d382c24', '527ec494-4fcb-417f-a558-400d043545d1', '75c7294c-9385-4d72-8f74-4e888de0d353', '827965f7-9604-4c5e-abc8-ea73821dd64d']::uuid[], 'out-founder', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'Pocket', '리뷰 속 언급 4글·1소스(역할 from 1/to 0/alt 2/compare 1)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 1)', 'mention', 4, 4, 1, 2, ARRAY['100b5324-6fd6-41fa-baaf-a5e3bbbedabe', 'be33a612-d6cc-43fe-b771-7eb07282a630', 'e7b2427b-98dc-47f0-ba0d-c70e14e68ce6', 'f79aa1f9-a7f6-48f8-858e-bad4105f965a']::uuid[], 'out-founder', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'bitwarden', '리뷰 속 언급 3글·1소스(역할 from 1/to 1/alt 0/compare 1)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 1)', 'mention', 3, 3, 1, 0, ARRAY['1234cb3c-302f-433a-bfb2-75e1997bc871', '372d58f8-192f-4456-893a-779c7ccb0aaf', 'e2610e71-873e-4d82-b30e-31a4c7e316ad']::uuid[], 'out-founder', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'ERPNext', '리뷰 속 언급 4글·1소스(역할 from 0/to 4/alt 0/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(2 0.75)', 'mention', 4, 4, 1, 0, ARRAY['16e2d845-6a92-4352-a494-73a3ddf8ef72', '19310577-4ced-4bcb-88bc-bea13fc2f746', 'b7ef661e-a10d-42dc-9cb1-8d25d00fbc76', 'e6482831-2af9-45c3-bd37-14691371717b']::uuid[], '2', 0.75, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'table', '리뷰 속 언급 3글·1소스(역할 from 1/to 2/alt 0/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(2 0.333)', 'mention', 3, 3, 1, 0, ARRAY['17bc37d7-28e9-4366-bf6d-e855c05f4d6e', '537eac52-4fc2-45d7-acc2-cccb0d53d18f', '80ea6bb9-7ef8-4a60-8e41-226aa6b2e35b']::uuid[], '2', 0.333, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'S3', '리뷰 속 언급 3글·2소스(역할 from 0/to 1/alt 1/compare 1)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 0.667)', 'mention', 3, 3, 2, 1, ARRAY['20112833-3f4f-44c1-8e84-b6674f70fe53', '6de79987-afc0-49c7-bbcc-94fd3c6853f9', 'a7d2ad93-e7f9-45af-bd6d-e55e70473a29']::uuid[], 'out-founder', 0.667, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'Render', '리뷰 속 언급 3글·2소스(역할 from 0/to 1/alt 1/compare 1)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 0.667)', 'mention', 3, 3, 2, 1, ARRAY['24668e77-0955-4476-abd5-7b7a7d8c2ecb', 'a2fae2a9-7fbb-4250-b815-b74e8f617ec4', 'ff96d2c1-4ba9-428b-8a61-c7905fb177b7']::uuid[], 'out-founder', 0.667, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'Screen Studio', '리뷰 속 언급 3글·1소스(역할 from 0/to 0/alt 3/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 1)', 'mention', 3, 3, 1, 3, ARRAY['2ef70116-51c9-45a0-b421-e56ddfb54e47', '4e6b4e9f-7355-40cb-8b73-90601860e1d5', 'e8a71a2e-40a2-4809-863e-fe1bf78d6754']::uuid[], 'out-founder', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'Barawave', '리뷰 속 언급 3글·1소스(역할 from 0/to 3/alt 0/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 0.667)', 'mention', 3, 3, 1, 0, ARRAY['447e0394-0a04-498f-acd6-4a15db1b5a5d', '8b723539-287b-4fa7-9e2c-6659cb7f68c4', 'a8ad9db4-e95a-422e-a05c-a5466ac2090a']::uuid[], 'out-founder', 0.667, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', '전동칫솔', '리뷰 속 언급 4글·1소스(역할 from 0/to 4/alt 0/compare 0)', NULL, NULL, NULL, 'unverified', 'area_fit(out-consumer 1)', 'mention', 4, 4, 1, 0, ARRAY['67a37fc1-8723-47a5-8612-475f3b303803', '8c8a43d7-1613-4d62-8249-5456509b6677', '91b47ba1-6d22-492a-a7e5-4871793da0e4', 'd3aef4f1-20db-45e1-8a8a-1b91c21d7fa7']::uuid[], 'out-consumer', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'OpenAI', '리뷰 속 언급 3글·2소스(역할 from 0/to 0/alt 1/compare 2)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 0.667)', 'mention', 3, 3, 2, 1, ARRAY['7d6e42b1-6bc2-4abb-9c34-debe9bdd0030', 'c0d3c7f3-22c1-488d-b140-760eb262c56e', 'fafeb993-35fd-4faa-8fdd-ee0e73ad1823']::uuid[], 'out-founder', 0.667, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'data', '리뷰 속 언급 7글·3소스(역할 from 0/to 0/alt 1/compare 6)', NULL, NULL, NULL, 'unverified', 'area_fit(out-founder 0.429)', 'mention', 7, 7, 3, 1, ARRAY['7fa2d77f-2904-478a-a38f-08798e6790dc', '8966a93c-2f23-4837-8485-6135d039059b', '9a3ee122-dbfd-4c05-b349-09df8bdea72f', 'af634948-dc28-4b5c-95ab-9698f4bf396f', 'b25f3dbc-d16c-4470-a1c8-195e5aec68b6', 'b5b77a04-eea6-4d8f-84e6-94ced398bb08', 'f7af2a99-8634-4c73-8a72-f527a95c03e3']::uuid[], 'out-founder', 0.429, NULL, '2026-10-21T00:00:00+09:00')
ON CONFLICT (kind, lower(name)) DO UPDATE SET mention_count = EXCLUDED.mention_count, post_count = EXCLUDED.post_count, source_count = EXCLUDED.source_count, alt_seek_posts = EXCLUDED.alt_seek_posts, evidence_input_ids = EXCLUDED.evidence_input_ids, area_code = EXCLUDED.area_code, area_fit = EXCLUDED.area_fit, gate_blocked = EXCLUDED.gate_blocked, last_seen_at = EXCLUDED.last_seen_at
  WHERE public.discovery_candidates.origin = 'mention' AND public.discovery_candidates.verdict <> 'accepted' AND public.discovery_candidates.mention_count IS NOT NULL;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.discovery_candidates WHERE origin = 'mention' AND last_seen_at = '2026-10-21T00:00:00+09:00';
  RAISE NOTICE '언급 대장 2026-10-21: origin=mention·이 날짜 행 % / 대장 14(차이 = 같은 이름의 HN 발굴·새 출시 행)', n;
END $$;

COMMIT;

-- 확인: SELECT count(*) FROM public.discovery_candidates WHERE origin = 'mention' AND mention_count IS NOT NULL;  -- 기대 ≥ 1 (리뷰 속 언급 행)
