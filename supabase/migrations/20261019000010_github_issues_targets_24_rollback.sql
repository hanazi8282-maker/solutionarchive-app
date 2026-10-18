-- 20261019000010_github_issues_targets_24 롤백 — 이 마이그가 넣은 24개 타깃을 멈춘다(exhausted). 멱등.
-- DELETE 가 아니라 status 변경: 수집이 돌았으면 analysis_inputs·지문이 타깃을 가리킨다. 수집분·새 collecting 프로젝트 삭제는 사람 판단(§10.2 예외 1).

BEGIN;

UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE source_key = 'github_issues' AND status = 'active'
   AND product_ref IN ('board:bigbluebutton', 'board:buzz', 'board:speakr', 'board:mattermost', 'board:invoiceninja', 'board:dolibarr', 'board:chatwoot', 'board:zammad', 'board:odoo', 'board:umami', 'board:formbricks', 'board:matomo', 'board:novu', 'board:posthog', 'board:leantime', 'board:ever-gauzy', 'board:logseq', 'board:outline', 'board:joplin', 'board:docmost', 'board:memos', 'board:siyuan', 'board:zettlr', 'board:marktext');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets
   WHERE source_key = 'github_issues' AND status = 'active'
     AND product_ref IN ('board:bigbluebutton', 'board:buzz', 'board:speakr', 'board:mattermost', 'board:invoiceninja', 'board:dolibarr', 'board:chatwoot', 'board:zammad', 'board:odoo', 'board:umami', 'board:formbricks', 'board:matomo', 'board:novu', 'board:posthog', 'board:leantime', 'board:ever-gauzy', 'board:logseq', 'board:outline', 'board:joplin', 'board:docmost', 'board:memos', 'board:siyuan', 'board:zettlr', 'board:marktext');
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 활성 타깃 %', n; END IF;
END $$;

COMMIT;
