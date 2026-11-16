-- 롤백 — 20261116000002_github_payments_targets_3. 수집된 입력이 있으면 지우지 않고 타깃만 exhausted 로 멈춘다(데이터 보존).
BEGIN;
UPDATE public.review_targets SET status = 'exhausted'
 WHERE source_key = 'github_issues' AND product_ref IN ('board:bigcapital', 'board:invoiceshelf', 'board:akaunting');
COMMIT;
