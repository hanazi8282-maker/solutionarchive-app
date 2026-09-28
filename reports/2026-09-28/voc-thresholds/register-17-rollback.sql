-- 되살아난 SaaS 후보 17건 수집 등록(2026-09-28, 남헌 지시 B — Stripe·Buffer 제외) 되돌리기.
-- 등록 내용: analysis_projects 17행(status='collecting', business_model='SAAS') · review_targets 17행(hackernews, q:<이름>, active)
--            · discovery_candidates.project_id 17행 연결.
-- ⚠️ 수집이 한 번이라도 돌았으면 analysis_inputs·review_fingerprints 가 이 프로젝트에 붙는다 — 아래 DELETE 전에
--    그 행 수를 먼저 보고, 0 이 아니면 사람 판단(§10.2 되돌리기 어려운 삭제)으로 넘긴다. 수집만 멈추려면 1단계만 쓴다.

-- 1단계(안전): 수집 중지
update review_targets set status = 'exhausted'
 where source_key = 'hackernews'
   and product_ref in ('q:Typeform','q:Postmark','q:PostHog','q:Metabase','q:Gumroad','q:Retool','q:Datadog','q:Fly.io','q:Sentry','q:Pinboard','q:Loom','q:Superhuman','q:Basecamp','q:Tailscale','q:Figma','q:1Password','q:Ghost');

-- 2단계(삭제 — 입력 0건 확인 뒤에만)
-- select p.product_elevator_pitch, count(i.id) from analysis_projects p left join analysis_inputs i on i.project_id = p.id
--  where p.id in (select project_id from discovery_candidates where verdict_reason like 'voc_ok:%(reclass 2026-09-28%' and project_id is not null) group by 1;
-- begin;
-- create temp table _p as select project_id id from discovery_candidates where verdict_reason like 'voc_ok:%(reclass 2026-09-28%' and project_id is not null;
-- update discovery_candidates set project_id = null where project_id in (select id from _p);
-- delete from review_targets where project_id in (select id from _p);
-- delete from analysis_projects where id in (select id from _p);
-- commit;
