-- ============================================================
-- 20261019000020_youtube_saas_targets — v71au ⑪ / v71at 1: YouTube 영역 ①~⑤ SaaS 영상 23개 타깃 등재 (활성 0 → 복구)
--
-- ⛔ 미적용 상태로 PR 에 올린다. 코드(lib/analysis/consumer-material.ts: 영역 ①~⑤·design 프로젝트의 유튜브 글은 소비재 소스 규칙에서 제외)가
--    main 에 머지된 **뒤** 적용한다. 적용 뒤 판정에 연결하려면 리포 변수 RELEVANCE_EXCLUDE_SOURCES=none (롤백: 변수 삭제).
-- 진단(2026-10-19 DB 실측): 기존 타깃 19개는 전부 소비재 영상(이어폰·유산균·정수기 등, 프로젝트 area_code=out-consumer)이고 전부 끝까지 읽혀 exhausted.
--   램프 supply_state='short' — 읽을 타깃이 없다. 유튜브 입력 10,553건 중 10,537건이 소비재 태그, 판정 935건. 즉 소진은 정상이고 공급 부족이 원인이다.
-- 영상 선정(2026-10-19, YouTube Data API v3 — search.list 26회(별도 하루 100회 버킷) + videos.list 26유닛, 키 없는 값 출력 없음):
--   영역별 한/영 질의 26개로 상위 6개씩 조회 → 댓글 수 30~6,000 · 2023-06 이후 · 댓글 사용 가능(commentCount 존재) 영상을 질의당 최대 3개 → 댓글 많은 순 23개.
--   합계 댓글 3589건(일회성). 리뷰형 영상은 댓글이 적다(질의 상위 영상 대부분 <60) — 일 수확은 신규 댓글분(수십 건/일) [추정].
--   댓글이 꺼진 영상은 포함하지 않았다(commentCount 가 없으면 제외 — 403 commentsDisabled 가 소스 전체를 멈추는 사고 방지, youtube.ts 주석).
-- 약관: 보관 override 유지 — 삭제·만료·갱신 장치를 만들지 않는다(남헌 v54 §4 · v71at 1). 위험은 남헌 몫.
-- 🟢 비파괴·멱등. INSERT 만: analysis_projects ≤16(같은 pitch 재사용) · review_targets ≤23. UPDATE·DELETE·DDL 없음.
-- 롤백: 20261019000020_youtube_saas_targets_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT enabled FROM public.review_sources WHERE key = 'youtube';                                  -- 기대: t
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'youtube' AND status = 'active';    -- 기대: 0

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'youtube' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'youtube 가 없거나 enabled=false — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _yt (ref text NOT NULL, area text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _yt (ref, area, label, pitch, url) VALUES
  ('v:Zhh81UPteSs', '3', '3:yt|Best Social Media Management Tools 2026? Met·964댓글', 'YouTube 영상 댓글 — Buffer vs Hootsuite', 'https://www.youtube.com/watch?v=Zhh81UPteSs'),
  ('v:jzWxBuvwuwQ', '3', '3:yt|MASTER CANVA IN 15 MINUTES! Canva Tutorial F·570댓글', 'YouTube 영상 댓글 — Canva', 'https://www.youtube.com/watch?v=jzWxBuvwuwQ'),
  ('v:A6fthJXJX-w', '2', '2:yt|Best CRM Software 2026? Notion vs Airtable v·371댓글', 'YouTube 영상 댓글 — CRM 비교(중소기업)', 'https://www.youtube.com/watch?v=A6fthJXJX-w'),
  ('v:sf9N2Xyv150', '5', '5:yt|카카오톡 보낼때 1초만에 자동으로 맞춤법과 띄어쓰기 수정하는 방법·266댓글', 'YouTube 영상 댓글 — 맞춤법 검사기', 'https://www.youtube.com/watch?v=sf9N2Xyv150'),
  ('v:GCMdLB82FXg', '2', '2:yt|My TOP 5 CRM Software | Free vs Paid CRMs fo·194댓글', 'YouTube 영상 댓글 — CRM 비교(중소기업)', 'https://www.youtube.com/watch?v=GCMdLB82FXg'),
  ('v:9lKkqYE0ilk', '1', '1:yt|이 AI들만 있으면 완벽한 기록이 가능해집니다 | 회의록, 발표 준비에 필수 A·173댓글', 'YouTube 영상 댓글 — 다글로', 'https://www.youtube.com/watch?v=9lKkqYE0ilk'),
  ('v:t8QM5zunC44', '2', '2:yt|HubSpot CRM Tutorial for Beginners 2026 (Ste·170댓글', 'YouTube 영상 댓글 — HubSpot CRM', 'https://www.youtube.com/watch?v=t8QM5zunC44'),
  ('v:UwThwHPgsIw', '3', '3:yt|Canva Tutorial for Beginners (How to Master ·141댓글', 'YouTube 영상 댓글 — Canva', 'https://www.youtube.com/watch?v=UwThwHPgsIw'),
  ('v:5xyCr7kQxjI', '1', '1:yt|How to Use Free Fathom AI Note Taker·109댓글', 'YouTube 영상 댓글 — Fathom AI notetaker', 'https://www.youtube.com/watch?v=5xyCr7kQxjI'),
  ('v:oQuxPlmBkxs', '5', '5:yt|Obsidian Vs Notion | Which Note Taking App S·73댓글', 'YouTube 영상 댓글 — Obsidian vs Notion', 'https://www.youtube.com/watch?v=oQuxPlmBkxs'),
  ('v:SyqipCxv0EY', '1', '1:yt|How To Use Otter AI To Transcribe Audio - Fe·64댓글', 'YouTube 영상 댓글 — Otter.ai', 'https://www.youtube.com/watch?v=SyqipCxv0EY'),
  ('v:dhw809OBerA', '1', '1:yt|I Used Granola AI for 365 Days. Here''s What ·61댓글', 'YouTube 영상 댓글 — Granola AI notes', 'https://www.youtube.com/watch?v=dhw809OBerA'),
  ('v:xck829Rk81s', '1', '1:yt|Granola AI Review - (2026) I Let This AI Tak·53댓글', 'YouTube 영상 댓글 — Granola AI notes', 'https://www.youtube.com/watch?v=xck829Rk81s'),
  ('v:Zq1kfwRWkmk', '2', '2:yt|BEST CRM Software | Tested 15 CRMs for 2026 ·47댓글', 'YouTube 영상 댓글 — CRM 비교(중소기업)', 'https://www.youtube.com/watch?v=Zq1kfwRWkmk'),
  ('v:qHEDCWg0fxk', '2', '2:yt|HubSpot’s Free CRM Review 2026 | Freemium Fe·42댓글', 'YouTube 영상 댓글 — HubSpot CRM', 'https://www.youtube.com/watch?v=qHEDCWg0fxk'),
  ('v:kxLIkNSSie8', '1', '1:yt|Try Fireflies AI Today·41댓글', 'YouTube 영상 댓글 — Fireflies.ai', 'https://www.youtube.com/watch?v=kxLIkNSSie8'),
  ('v:wk3rRnC2xtE', '1', '1:yt|Krisp Review - 2026 | #1 AI Meeting Assistan·38댓글', 'YouTube 영상 댓글 — Krisp noise cancelling meeting', 'https://www.youtube.com/watch?v=wk3rRnC2xtE'),
  ('v:SqI3CvKV4j8', '5', '5:yt|Jasper AI: An Honest Review & Beginner’s Gui·38댓글', 'YouTube 영상 댓글 — Jasper AI', 'https://www.youtube.com/watch?v=SqI3CvKV4j8'),
  ('v:VHbUHlnP5KI', '5', '5:yt|Jasper AI Review 2025 | Best AI Copywriter?·38댓글', 'YouTube 영상 댓글 — Jasper AI', 'https://www.youtube.com/watch?v=VHbUHlnP5KI'),
  ('v:PqjIdyquZzM', '1', '1:yt|Read AI Review - Best AI Meeting Assistant f·35댓글', 'YouTube 영상 댓글 — Read AI meeting', 'https://www.youtube.com/watch?v=PqjIdyquZzM'),
  ('v:gQWP5sywmGg', '1', '1:yt|플라우드노트,네이버 클로바노트와 비교해봤어요!! ai녹음기 실사용후기 #플라우드·34댓글', 'YouTube 영상 댓글 — 클로바노트', 'https://www.youtube.com/watch?v=gQWP5sywmGg'),
  ('v:KwiH0PBvB1g', '1', '1:yt|녹음한 내용 텍스트로 변환, AI 요약까지 끝내는 클로바노트 사용법 (회의록 필·34댓글', 'YouTube 영상 댓글 — 클로바노트', 'https://www.youtube.com/watch?v=KwiH0PBvB1g'),
  ('v:iHZq78MUWms', '2', '2:yt|A Quick Demo of Pipedrive CRM 🏁 🏎️·33댓글', 'YouTube 영상 댓글 — Pipedrive CRM', 'https://www.youtube.com/watch?v=iHZq78MUWms');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model,
                                      area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS',
       g.area, 'label', 'label:' || g.label, 'v71au', now()
  FROM _yt g
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch)
 ORDER BY g.pitch, g.ref;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'youtube', g.ref, g.label, NULL, 'active'
  FROM _yt g
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'youtube' AND t.product_ref = g.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets t JOIN _yt g ON t.source_key = 'youtube' AND t.product_ref = g.ref WHERE t.status = 'active';
  IF n <> 23 THEN RAISE EXCEPTION '타깃 % 개(기대 23)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'youtube' AND status = 'active';    -- 기대: 23
--   SELECT left(label, 1) AS area, count(*) FROM public.review_targets WHERE source_key = 'youtube' GROUP BY 1 ORDER BY 1;
