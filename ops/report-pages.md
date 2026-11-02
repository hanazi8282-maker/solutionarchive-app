# 비공개 결론서 링크 `/r/{token}` 운영 절차

결론서 HTML 1장을 로그인 없는 비공개 링크로 연다. 코드: `app/r/[token]/route.ts` · `lib/report-pages/core.ts`.
테이블: `report_pages` · `report_views` (마이그 `20261103000020`, service_role 전용).
이 문서에는 회사명·토큰·연락처 같은 실제 값을 적지 않는다(공개 리포). `<slug>` `<token>` 자리만 둔다.

## 하지 않는 것

- **발송용 링크는 남헌 건별 승인 뒤에만 만든다.** 게시는 해도 되지만 전체 URL 을 DM 에 붙이는 건 승인 뒤.
- 결론서 HTML·토큰·전체 URL 을 리포·PR·Notion·채팅에 남기지 않는다.
- 열람 수를 "읽었다"로 보고하지 않는다. **열람 추정**이고 A등급이 아닌 추정치다
  (UA 로 bot/browser 2분류 — 일반 브라우저 UA 를 쓰는 메일 스캐너는 못 거른다).

## 스크립트 (리포 루트, `.env.local` 의 서비스키 사용 — 값은 출력되지 않는다)

- 게시: `node scripts/report-pages.mjs publish <파일.html> --company <slug>` (버전 자동 +1, URL 은 마스킹 출력)
- 즉시 회수: `node scripts/report-pages.mjs revoke --company <slug> [--version N]` (그 즉시 404)
- 열람 추정: `node scripts/report-pages.mjs views --company <slug>`

결론서 HTML 은 외부 리소스를 못 부른다(CSP `default-src 'none'`). 인라인 `<style>` 과 `data:` 이미지로만 만든다.
스크립트·링크 클릭도 동작하지 않는다(`sandbox=""`).

## SQL 한 줄 절차 (Dashboard SQL Editor)

- 전체 URL 확인(발송 승인 뒤에만): `SELECT 'https://solutionarch.vercel.app/r/' || token FROM report_pages WHERE company_slug = '<slug>' AND revoked_at IS NULL ORDER BY version DESC LIMIT 1;`
- 즉시 회수: `UPDATE report_pages SET revoked_at = now() WHERE company_slug = '<slug>' AND revoked_at IS NULL;`
- 회수 취소: `UPDATE report_pages SET revoked_at = NULL WHERE company_slug = '<slug>' AND version = <N>;`
- 열람 추정(browser 만, 같은 토큰 10분 내 1회 — 스크립트와 같은 규칙, A등급 아닌 추정치): `WITH RECURSIVE b AS (SELECT viewed_at, row_number() OVER (ORDER BY viewed_at) n FROM report_views v JOIN report_pages p USING (token) WHERE p.company_slug = '<slug>' AND p.version = <N> AND v.kind = 'browser'), c AS (SELECT n, viewed_at AS anchor, 1 AS cnt FROM b WHERE n = 1 UNION ALL SELECT b.n, CASE WHEN b.viewed_at - c.anchor >= interval '10 minutes' THEN b.viewed_at ELSE c.anchor END, c.cnt + (b.viewed_at - c.anchor >= interval '10 minutes')::int FROM c JOIN b ON b.n = c.n + 1) SELECT coalesce(max(cnt), 0) AS 열람_추정 FROM c;`

## 확인 순서 (게시 직후)

1. 스크립트 출력에 `게시: <slug> vN → …/r/xxxx…(masked)` 가 찍혔는가.
2. 회수 연습은 가짜 문서로만 한다 — 회수 뒤 같은 URL 이 404 인지.
