-- ============================================================
-- 20261019000010_github_issues_targets_24 — v71au ⑪ / v71at 2(a): github_issues 영역 ①~⑤ 오픈소스 도구 24곳 등재
--
-- ⛔ 미적용 상태로 PR 에 올린다. 코드(lib/review/adapters/github.ts REPOS 24곳 추가)가 main 에 머지된 **뒤** 적용한다.
--    코드가 없으면 어댑터가 slug 를 몰라 nextRequest 가 null 을 주고 24곳이 조용히 안 돈다.
-- 선행: 20261017000110(github_issues 소스·램프) 적용·enabled=true. 램프 cap_base 는 2026-10-19 에 240(목표 120/일)으로 올라가 있다.
--
-- 근거(2026-10-19 무토큰 Search 실측, 메인테이너·봇 제외 사용자 이슈/일 = 최근 50건 기준): 아래 표. 합 89.6/일이나 siyuan 32.3·ever-gauzy 17.5·posthog 5.7·
--   marktext 5.2 는 최근 며칠 폭주분이다 — 정상상태는 합의 1/3 안팎 [추정]. 영역 ①(회의·통화)·④(인사·근태)는 공개 이슈 트래커가 있는 오픈소스가 적어 4·2곳뿐이다.
--   첫 실행은 타깃당 최대 BACKFILL_PAGES(5)페이지(≤250건) = 24곳 일회성 최대 6,000건(요청 120회, 램프 목표 120/일 → 약 1일).
--   T2 관련 비율: 기존 github_issues 는 판정 대비 relevant 88%(2026-10-18 실측, 647/739) — 오픈소스 버그 리포트가 많아 영역 ①~⑤ 정보로 얼마나 쓰일지는 판정 뒤 재평가.
--   제외(실측 부적합): rate<0.4 — monica 0.08·akaunting 0.06·plausible 0.09·mailtrain 0.04·solidtime 0.14·timetagger 0.09·hedgedoc 0.13·trilium 0.11·nextcloud/notes 0.22·scriberr 0.21·openreplay 0.35;
--     저장소 이름 변경/없음(HTTP 422): calcom/cal.com·horilla·plane·sendportal.
--   약관·robots: github_issues 소스 행 라벨 그대로(tos unverified·남헌 v71ad 승인). 새 법적 리스크 없음(§10.2 예외 4번 해당 없음).
--
-- 🟢 비파괴·멱등. INSERT 만: analysis_projects ≤24(같은 pitch 있으면 재사용) · review_targets ≤24(같은 source_key+product_ref 있으면 건너뜀). UPDATE·DELETE·DDL 없음.
-- 롤백: 20261019000010_github_issues_targets_24_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT enabled FROM public.review_sources WHERE key = 'github_issues';                                    -- 기대: t
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'github_issues';                            -- 기대: 16
--   (코드) git grep -c "'ever-gauzy'" origin/main -- lib/review/adapters/github.ts                           -- 기대: 1

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'github_issues' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'github_issues 가 없거나 enabled=false — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _gh (ref text NOT NULL, area text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _gh (ref, area, label, pitch, url) VALUES
  ('board:bigbluebutton', '1', '1:gh|bigbluebutton', 'BigBlueButton — 오픈소스 온라인 수업·웹 회의', 'https://bigbluebutton.org/'),
  ('board:buzz', '1', '1:gh|buzz', 'Buzz — 오프라인 음성 전사·번역 데스크톱 앱', 'https://github.com/chidiwilliams/buzz'),
  ('board:speakr', '1', '1:gh|speakr', 'Speakr — 셀프호스팅 회의 녹음·전사·요약', 'https://github.com/murtaza-nasir/speakr'),
  ('board:mattermost', '1', '1:gh|mattermost', 'Mattermost — 오픈소스 팀 메신저·통화', 'https://mattermost.com/'),
  ('board:invoiceninja', '2', '2:gh|invoiceninja', 'Invoice Ninja — 오픈소스 견적·청구서·결제', 'https://invoiceninja.com/'),
  ('board:dolibarr', '2', '2:gh|dolibarr', 'Dolibarr — 오픈소스 ERP·CRM', 'https://www.dolibarr.org/'),
  ('board:chatwoot', '2', '2:gh|chatwoot', 'Chatwoot — 오픈소스 고객 문의·상담 채널 통합', 'https://www.chatwoot.com/'),
  ('board:zammad', '2', '2:gh|zammad', 'Zammad — 오픈소스 고객지원 헬프데스크', 'https://zammad.org/'),
  ('board:odoo', '2', '2:gh|odoo', 'Odoo — 오픈소스 ERP·CRM 스위트', 'https://www.odoo.com/'),
  ('board:umami', '3', '3:gh|umami', 'Umami — 오픈소스 웹 분석(Google Analytics 대안)', 'https://umami.is/'),
  ('board:formbricks', '3', '3:gh|formbricks', 'Formbricks — 오픈소스 설문·고객 피드백 수집', 'https://formbricks.com/'),
  ('board:matomo', '3', '3:gh|matomo', 'Matomo — 오픈소스 웹 분석', 'https://matomo.org/'),
  ('board:novu', '3', '3:gh|novu', 'Novu — 오픈소스 알림·메시지 발송 인프라', 'https://novu.co/'),
  ('board:posthog', '3', '3:gh|posthog', 'PostHog — 오픈소스 제품 분석·세션 리플레이', 'https://posthog.com/'),
  ('board:leantime', '4', '4:gh|leantime', 'Leantime — 오픈소스 프로젝트·업무 관리', 'https://leantime.io/'),
  ('board:ever-gauzy', '4', '4:gh|ever-gauzy', 'Gauzy — 오픈소스 인력·근무시간 관리 플랫폼', 'https://gauzy.co/'),
  ('board:logseq', '5', '5:gh|logseq', 'Logseq — 오픈소스 노트·아웃라이너', 'https://logseq.com/'),
  ('board:outline', '5', '5:gh|outline', 'Outline — 오픈소스 팀 위키·지식 문서', 'https://www.getoutline.com/'),
  ('board:joplin', '5', '5:gh|joplin', 'Joplin — 오픈소스 노트 앱(Evernote 대안)', 'https://joplinapp.org/'),
  ('board:docmost', '5', '5:gh|docmost', 'Docmost — 오픈소스 협업 문서·위키', 'https://docmost.com/'),
  ('board:memos', '5', '5:gh|memos', 'Memos — 오픈소스 셀프호스팅 메모', 'https://usememos.com/'),
  ('board:siyuan', '5', '5:gh|siyuan', 'SiYuan — 오픈소스 개인 지식 관리·노트', 'https://b3log.org/siyuan/'),
  ('board:zettlr', '5', '5:gh|zettlr', 'Zettlr — 오픈소스 마크다운 글쓰기 앱', 'https://www.zettlr.com/'),
  ('board:marktext', '5', '5:gh|marktext', 'MarkText — 오픈소스 마크다운 에디터', 'https://github.com/marktext/marktext');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model,
                                      area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS',
       g.area, 'label', 'label:' || g.label, 'v71au', now()
  FROM _gh g
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch)
 ORDER BY g.pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'github_issues', g.ref, g.label, NULL, 'active'
  FROM _gh g
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'github_issues' AND t.product_ref = g.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets t JOIN _gh g ON t.source_key = 'github_issues' AND t.product_ref = g.ref
   WHERE t.status = 'active';
  IF n <> 24 THEN RAISE EXCEPTION '타깃 % 개(기대 24)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'github_issues' AND status = 'active';       -- 기대: 40
--   SELECT left(label, 1) AS area, count(*) FROM public.review_targets WHERE source_key = 'github_issues' GROUP BY 1 ORDER BY 1;
