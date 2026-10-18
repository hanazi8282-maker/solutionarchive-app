-- 20261019000091_discourse_subboards — Discourse 5곳 서브보드 7개 타깃 등록(v71au ⑤). ⛔ 미적용. 코드 짝: lib/review/adapters/discourse.ts boards 표(같은 PR). 코드가 main 에 오른 뒤 적용한다. 롤백: _rollback.sql. 확인: SELECT source_key, product_ref FROM review_targets WHERE source_key LIKE '%_forum' OR source_key LIKE '%_community';
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = 'n8n_community' AND enabled) <> 1 THEN RAISE EXCEPTION 'n8n_community 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT '8ce7f2a3-df87-49fa-bd65-486ce8a45377'::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES
    ('n8n_community', 'board:help-me-build-my-workflow', 'n8n_community: help-me-build-my-workflow')
) AS v(src, ref, label)
WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);
COMMIT;
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = 'bubble_forum' AND enabled) <> 1 THEN RAISE EXCEPTION 'bubble_forum 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT 'd8bd112e-3597-466f-b9dd-7cbc599c27b5'::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES
    ('bubble_forum', 'board:questions', 'bubble_forum: questions'),
    ('bubble_forum', 'board:bugs', 'bubble_forum: bugs')
) AS v(src, ref, label)
WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);
COMMIT;
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = 'retool_community' AND enabled) <> 1 THEN RAISE EXCEPTION 'retool_community 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT '6da0dbdb-da27-4fdc-baae-a8bc694c6bf9'::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES
    ('retool_community', 'board:workflows', 'retool_community: workflows'),
    ('retool_community', 'board:mobile', 'retool_community: mobile')
) AS v(src, ref, label)
WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);
COMMIT;
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = 'glide_community' AND enabled) <> 1 THEN RAISE EXCEPTION 'glide_community 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT 'b7214981-4924-4494-a631-d1188285343a'::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES
    ('glide_community', 'board:bugs', 'glide_community: bugs')
) AS v(src, ref, label)
WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);
COMMIT;
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = 'softr_community' AND enabled) <> 1 THEN RAISE EXCEPTION 'softr_community 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT '514d2dcc-9fc4-4522-9509-30c611b6c466'::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES
    ('softr_community', 'board:bug-reports', 'softr_community: bug-reports')
) AS v(src, ref, label)
WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);
COMMIT;
