-- 20261019000020_youtube_saas_targets 롤백 — 이 마이그가 넣은 23개 유튜브 타깃을 멈춘다(exhausted). 멱등.
-- DELETE 가 아니라 status 변경: 수집이 돌았으면 analysis_inputs·지문이 타깃을 가리킨다. 수집분 삭제는 사람 판단(§10.2 예외 1). 보관 override 유지 — 삭제 장치 없음.
-- 판정 연결 롤백은 별도: 리포 변수 RELEVANCE_EXCLUDE_SOURCES 삭제(다시 youtube 제외).

BEGIN;

UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE source_key = 'youtube' AND status = 'active'
   AND product_ref IN ('v:Zhh81UPteSs', 'v:jzWxBuvwuwQ', 'v:A6fthJXJX-w', 'v:sf9N2Xyv150', 'v:GCMdLB82FXg', 'v:9lKkqYE0ilk', 'v:t8QM5zunC44', 'v:UwThwHPgsIw', 'v:5xyCr7kQxjI', 'v:oQuxPlmBkxs', 'v:SyqipCxv0EY', 'v:dhw809OBerA', 'v:xck829Rk81s', 'v:Zq1kfwRWkmk', 'v:qHEDCWg0fxk', 'v:kxLIkNSSie8', 'v:wk3rRnC2xtE', 'v:SqI3CvKV4j8', 'v:VHbUHlnP5KI', 'v:PqjIdyquZzM', 'v:gQWP5sywmGg', 'v:KwiH0PBvB1g', 'v:iHZq78MUWms');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets
   WHERE source_key = 'youtube' AND status = 'active' AND product_ref IN ('v:Zhh81UPteSs', 'v:jzWxBuvwuwQ', 'v:A6fthJXJX-w', 'v:sf9N2Xyv150', 'v:GCMdLB82FXg', 'v:9lKkqYE0ilk', 'v:t8QM5zunC44', 'v:UwThwHPgsIw', 'v:5xyCr7kQxjI', 'v:oQuxPlmBkxs', 'v:SyqipCxv0EY', 'v:dhw809OBerA', 'v:xck829Rk81s', 'v:Zq1kfwRWkmk', 'v:qHEDCWg0fxk', 'v:kxLIkNSSie8', 'v:wk3rRnC2xtE', 'v:SqI3CvKV4j8', 'v:VHbUHlnP5KI', 'v:PqjIdyquZzM', 'v:gQWP5sywmGg', 'v:KwiH0PBvB1g', 'v:iHZq78MUWms');
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 활성 타깃 %', n; END IF;
END $$;

COMMIT;
