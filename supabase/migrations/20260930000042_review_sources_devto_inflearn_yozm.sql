-- ============================================================
-- 20260930000042_review_sources_devto_inflearn_yozm — VOC 소스 3행 등록(활성): devto · inflearn · yozm
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트가 만든 파일이다(CLAUDE.md §10.2 — 판단 주체가 아니다).
--
-- ⛔ 법적 조항 인지, 남헌 승인 하 강행(2026-09-30).
--    ops/state/source-review-queue.md 에 "대기"로 있던 7곳을 두고 남헌이 "약관·법적 조항과 무관하게
--    기술적으로 수집 가능한 곳은 전부 진행"을 명시 결정했다. §10.2 예외 4번(새 법적 리스크)의 사람 판단이
--    내려진 것이므로 enabled=true 로 넣는다(disquiet 20260930000026 선례).
--    넘지 않은 선: robots 명시 Disallow · robots 확인 불가 · 봇 방어 챌린지는 우회하지 않았다 —
--    그 셋에 걸린 4곳(Indie Hackers · Hashnode · 아이보스 · GeekNews)은 여기 없다(큐 파일 참조).
--
-- ── 소스별 조항 인용(원문 그대로, 큐 파일에서 옮김) ─────────────────────
--   devto    — dev.to 약관 §2 "Permission is granted to temporarily download one copy of the materials …
--              for personal, non-commercial transitory viewing only … you may not: modify or copy the
--              materials; use the materials for any commercial purpose"
--              (공개 API `/api/articles` 에 별도 약관이 있는지는 확인하지 않았다.)
--   inflearn — 약관 /policy/terms-of-service 는 CSR 이라 평문 54자 — **조항을 못 읽었다**.
--              금지 조항이 있는지 모르는 채로 켠다(남헌 결정 범위: "약관과 무관").
--   yozm     — 큐에 오른 사유는 약관이 아니라 robots 확인 불가(오전 `GET /robots.txt` → 302 Cloudflare)였다.
--              2026-09-30 재실측에서 200 · 452B 로 읽혔다(아래). 약관 자동수집 조항은 **인용하지 못했다**.
--
-- ── 기술 점검(2026-09-30, 우리 UA, 소스당 ≤5요청 · 간격 6.5초) — robots 는 lib/review/robots.ts robotsVerdict ──
--   devto    robots 200 · `*` 는 /search?q=·/admin/·/mod/·/reactions? 등만 Disallow → /api/articles·/api/comments 허용.
--            목록 JSON(`/api/articles?tag=saas`) · 본문 JSON(`/api/articles/<id>` body_markdown) ·
--            댓글 JSON(`/api/comments?a_id=<id>`, 대댓글 트리) 전부 로그인·키 없이 200.
--   inflearn robots 200 · `*` 는 /community 를 막지 않음(`/community/*?*tag=*,` · `/api` 만 Disallow).
--            목록 서버 렌더 <article> 20건 · 글은 307 → slug 주소(같은 호스트) · JSON-LD QAPage(질문·답변).
--   yozm     robots 200 · `*`: Allow /magazine/ · Disallow /api/ /media/ /w/ … · Crawl-delay: 5.
--            `/magazine/` 첫 화면 서버 렌더 기사 링크 18개 · 기사 JSON-LD NewsArticle(articleBody). 댓글 없음.
--            분류 목록(/magazine/list/*)은 CSR 이고 데이터가 robots 금지 경로 /api/ 에서 온다 → 쓰지 않는다.
--
-- ⚠️ 보수적 설정. 모든 소스 min_interval_ms 6000(yozm 은 robots Crawl-delay 5 를 러너가 따로 읽는다).
--    daily_request_cap: devto 60 · inflearn 40 · yozm 40 (게시판 1개 = 실행당 ≤20요청 × 하루 2회 = 40).
--    403/429 가 오면 러너가 그 실행을 멈추고 소스를 끈다(enabled=false · disabled_reason 자동 기록).
--    우회하지 않는다 — 꺼지면 그대로 둔다(todayhumor 000019 선례).
--
-- 어댑터: lib/review/adapters/{devto,inflearn,yozm}.ts · 셀프테스트: scripts/review-{devto,inflearn,yozm}-selftest.mjs
-- 🟢 비파괴. INSERT + ON CONFLICT DO NOTHING 뿐. DDL 없음. 롤백 파일 있음. 타깃은 다음 파일(000043).
-- ============================================================

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'devto',
    'dev.to 태그 글·댓글',
    true,
    NULL,
    'ok', 6000, 60
  ),
  (
    'inflearn',
    '인프런 커뮤니티 질문&답변',
    true,
    NULL,
    'ok', 6000, 40
  ),
  (
    'yozm',
    '요즘IT 매거진 기사',
    true,
    NULL,
    'ok', 6000, 40
  )
ON CONFLICT (key) DO NOTHING;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성:
--   SELECT key, display_name, enabled, disabled_reason, min_interval_ms, daily_request_cap
--     FROM public.review_sources WHERE key IN ('devto', 'inflearn', 'yozm') ORDER BY key;
--   -- 기대: 3행 · enabled=true · 6000 · 60/40/40
-- 음성: 다른 소스는 그대로 — 적용 전후 같은 결과여야 한다.
--   SELECT count(*), count(*) FILTER (WHERE enabled) FROM public.review_sources WHERE key NOT IN ('devto', 'inflearn', 'yozm');
