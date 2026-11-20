-- v71cu S8-2: 유튜브 q:(검색어) 12개 + ch:(채널) 6개 타깃 등록. 롤백: 20261120000001_youtube_q_ch_targets_rollback.sql  ※ 파일만 — 적용은 오케스트레이터(§10.2).
-- 이 타깃들은 댓글 타깃이 아니다. layer='yt_query'|'yt_channel' → 러너(lib/review/store.ts)는 건너뛰고, scripts/youtube-expand.mjs 가 읽어 댓글 30+ 영상을 v: 타깃(layer 'video')으로 등록한다.
-- 약관·쿼터 안전: 소비재·정치·성인 제외. 사업 영역(결제·예약·마케팅·영업·근태) 검색어·SaaS 공식 채널만. 채널 이름·작성자 미저장. 채널 ID 는 2026-11-20 각 채널 페이지(@핸들)에서 직접 읽은 값.
-- 쿼터: search 1회/검색어 — 12개 전부 돌아도 하루 60 의 20%. 채널은 playlistItems 1유닛.
-- 비파괴·멱등: INSERT 만(같은 source_key+product_ref 있으면 건너뜀). 기존 행 변경·삭제 없음.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'youtube') <> 1 THEN RAISE EXCEPTION 'review_sources 에 youtube 가 없다 — 등록하지 않는다'; END IF;
END $$;

CREATE TEMP TABLE _y (area text, ref text, layer text, why text) ON COMMIT DROP;
INSERT INTO _y VALUES
 -- 결제·정산·회계
 ('payments_billing_accounting','q:Stripe 후기','yt_query','결제 대행 한국어 사용 후기 — 정산·수수료 불만이 댓글에 나온다'),
 ('payments_billing_accounting','q:QuickBooks vs Xero review','yt_query','회계 도구 비교 영상 — 갈아타는 이유가 댓글에 나온다'),
 ('payments_billing_accounting','q:invoice software alternative','yt_query','청구서 도구 대안 탐색 — 기존 도구 불만의 직접 신호'),
 -- 예약·일정·폼·전자서명
 ('booking_scheduling_forms','q:Calendly alternative','yt_query','일정 예약 도구 대안 — 요금·기능 한계 불만'),
 ('booking_scheduling_forms','q:예약 관리 프로그램 후기','yt_query','소상공인 예약 도구 한국어 후기'),
 ('booking_scheduling_forms','q:e-signature app honest review','yt_query','전자서명 도구 정직 리뷰 — 가격·제한 불만'),
 -- 마케팅 자동화·이메일
 ('marketing_automation','q:Mailchimp 단점','yt_query','이메일 마케팅 대표 도구의 단점 — 이탈 이유'),
 ('marketing_automation','q:email marketing automation review','yt_query','자동화 도구 비교 리뷰 영상'),
 -- SMB 영업·CRM
 ('sales_crm','q:HubSpot CRM review','yt_query','소규모 팀 CRM 리뷰 — 가격 급등·복잡도 불만'),
 ('sales_crm','q:소규모 CRM 추천 후기','yt_query','한국어 CRM 도입 후기'),
 -- 근태·HR·급여
 ('hr_attendance','q:근태관리 프로그램 후기','yt_query','한국어 근태 도구 후기'),
 ('hr_attendance','q:payroll software small business review','yt_query','소기업 급여 도구 리뷰 — 오류·요금 불만'),
 -- 채널(공식 SaaS 채널: 튜토리얼 영상 댓글에 사용자 불만·질문이 쌓임)
 ('payments_billing_accounting','ch:UCM1guA1E-RHLO2OyfQPOkEQ','yt_channel','Stripe 공식 — 결제 제품 사용자 질문·불만'),
 ('payments_billing_accounting','ch:UCNCK4UGSnceO052t8S1kMxw','yt_channel','QuickBooks 공식 — 회계 제품 사용자 댓글'),
 ('booking_scheduling_forms','ch:UCwTQJzfTzrxHQ0IcySGY6nQ','yt_channel','Calendly 공식 — 예약 제품 사용자 댓글'),
 ('marketing_automation','ch:UCxiKWDY5JIQmRAC84dnfVkg','yt_channel','Mailchimp 공식 — 이메일 마케팅 사용자 댓글'),
 ('marketing_automation','ch:UCEvsxF4Z12vwpwDUaU02yiA','yt_channel','Zapier 공식 — 자동화 제품 사용자 댓글'),
 ('hr_attendance','ch:UCJK8DG-ZgJrOzra7WsWBHNQ','yt_channel','Gusto 공식 — 급여·HR 제품 사용자 댓글');

-- 영역마다 프로젝트 1개(v: 타깃이 이 project_id 를 물려받는다).
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status, mode, business_model)
SELECT 'https://www.youtube.com/', 'YouTube 검색·채널 발굴 — ' || a, 'product_fit', 'collecting', 'forward', 'SAAS'
  FROM (SELECT DISTINCT area AS a FROM _y) s
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = 'YouTube 검색·채널 발굴 — ' || s.a);

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status, onboard_batch, layer)
SELECT (SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = 'YouTube 검색·채널 발굴 — ' || y.area ORDER BY p.created_at NULLS LAST, p.id LIMIT 1),
       'youtube', y.ref, y.area || ':' || y.why, NULL, 'active', 'yt_q_ch_20261120', y.layer
  FROM _y y
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'youtube' AND t.product_ref = y.ref);

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.review_targets WHERE onboard_batch = 'yt_q_ch_20261120' AND layer = 'yt_query';
  IF n < 12 THEN RAISE EXCEPTION 'q targets % (expected 12)', n; END IF;
  SELECT count(*) INTO n FROM public.review_targets WHERE onboard_batch = 'yt_q_ch_20261120' AND layer = 'yt_channel';
  IF n < 6 THEN RAISE EXCEPTION 'ch targets % (expected 6)', n; END IF;
END $$;
COMMIT;
