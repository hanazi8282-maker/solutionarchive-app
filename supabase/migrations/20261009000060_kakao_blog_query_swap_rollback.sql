-- 20261009000060 롤백 — 새 kakao_blog 타깃 10개를 failed 로 내린다(삭제하지 않는다 — 이미 들어온 입력·지문이 이 타깃을 가리킬 수 있다).
BEGIN;
UPDATE public.review_targets SET status = 'failed'
 WHERE source_key = 'kakao_blog'
   AND product_ref IN ('q:클로바노트 후기','q:다글로 후기','q:세일즈맵 후기','q:딥세일즈 후기','q:미리캔버스 AI 후기',
                       'q:망고보드 AI 후기','q:시프티 후기','q:레몬베이스 후기','q:뤼튼 후기','q:폴라리스 오피스 AI 후기');
COMMIT;
