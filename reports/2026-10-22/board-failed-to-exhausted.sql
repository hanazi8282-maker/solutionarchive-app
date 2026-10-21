-- board-failed-to-exhausted — v71ba P0-3. ⛔ 미적용 초안(CTO 서브에이전트). 적용은 오케스트레이터 판단(§10.2).
-- 선행: fix/v71ba-board-404-skip(게시판 큐 404 기본 건너뛰기) 머지 · 클리앙은 #591 도.
--
-- 왜: 러너는 HTTP ≥400(403·429 제외)·요청 실패를 받으면 그 타깃을 failed 로 닫는다(runner.ts). failed 는 재방문 시계(target-revive)가
--   보지 않아 영구 정지다. 2026-09-30 velog 에서만 고쳤던 "큐 맨 앞 글이 지워져 404 → 게시판 통째로 failed" 가 다른 게시판 어댑터 11곳에 남아 있었다.
--   2026-10-21 재고 게이지(reports/2026-10-21/limit-ledger.md): yozm·devto·tumblbug·brunch·theqoo·damoang·fmkorea 가 "활성 0 · 대기 예약 0"
--   = exhausted 도 없다 → 남은 타깃이 failed 라는 뜻(직접 확인은 아래 SELECT).
-- 무엇을: enabled 소스의 board: 타깃 중 failed 를 exhausted 로(status 한 칸). active 로 바로 열지 않는다 — 재방문 시계가 간격·상한·롤백 파일을
--   지켜 다음 슬롯부터 연다(§10.1 재방문 시계 범위 안으로 되돌리는 것). url: 타깃(글 1건)은 건드리지 않는다(지워진 글일 가능성이 높다).
--
-- 1) 먼저 보기 — 결과 id 를 롤백에 붙여 넣는다:
--   SELECT t.id, t.source_key, t.product_ref, t.status, t.last_run_at, t.total_collected
--     FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key
--    WHERE t.status = 'failed' AND t.product_ref LIKE 'board:%' AND s.enabled AND s.key NOT IN ('danawa', 'todayhumor', 'producthunt')
--    ORDER BY t.source_key, t.product_ref;
BEGIN;
UPDATE public.review_targets t
   SET status = 'exhausted'
  FROM public.review_sources s
 WHERE s.key = t.source_key AND s.enabled AND s.key NOT IN ('danawa', 'todayhumor', 'producthunt')
   AND t.status = 'failed' AND t.product_ref LIKE 'board:%';
COMMIT;
-- 확인: 위 SELECT 가 0행 · 같은 id 들이 exhausted. 다음 수집 슬롯의 target-revive 요약에 그 소스의 revive/skipped 사유가 찍힌다.
-- 롤백: UPDATE public.review_targets SET status = 'failed' WHERE id IN (<1) 의 id 목록>) AND status = 'exhausted';
--   (이미 되살아나 active 가 된 행은 target-revive 롤백 파일 reports/<KST>/target-revive-rollback-*.sql 이 먼저 exhausted 로 돌린다.)
