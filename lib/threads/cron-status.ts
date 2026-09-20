// 발행 파이프라인 크론 3개(match-posts · collect-metrics · collect-replies)의 HTTP 상태 한 벌.
//
// ★ 2026-09-20 이전: 루프 안 건 단위 실패(`failed[]`)를 본문 `ok:false` 에만 싣고 status 는 200 이었다.
//   Vercel 크론 대시보드는 status 만 본다 → 실패가 초록으로 보였다(감사 09-15 2-7/3-7, 09-19 치명 1-2).
//   collect-metrics 는 버킷 시각이 지나면 소급 수집이 안 되므로, 그 시간에 빨간불이 안 켜지면 영영 모른다.
//
// 규칙: 실패가 1건이라도 있으면 500. 207 같은 2xx 는 쓰지 않는다 — Vercel 은 2xx 를 전부 성공으로 센다.
//   본문은 종전 그대로 실어 부분 성공 내역(inserted/updated/failed)을 잃지 않는다. Vercel 크론은 재시도하지
//   않으므로 500 이 중복 처리를 부르지 않는다.
export function cronStatus(failedCount: number): 200 | 500 {
  return failedCount > 0 ? 500 : 200
}
