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
Google Fonts 등 외부 글꼴·CSS 도 막힌다(열람자 IP 가 제3자에 새지 않게) — 글꼴은 시스템 대체 글꼴로 그려진다.
스크립트는 동작하지 않는다(sandbox 에 `allow-scripts` 없음). 링크는 응답 때 전부 새 탭(`target=_blank`, `rel=noopener noreferrer`)으로
바뀌고, http(s)·mailto·tel·# 밖의 href(javascript:·data:·상대경로)는 지워진다. 저장된 HTML 은 바뀌지 않는다.

## SQL 한 줄 절차 (Dashboard SQL Editor)

- 전체 URL 확인(발송 승인 뒤에만): `SELECT 'https://solutionarch.vercel.app/r/' || token FROM report_pages WHERE company_slug = '<slug>' AND revoked_at IS NULL ORDER BY version DESC LIMIT 1;`
- 즉시 회수: `UPDATE report_pages SET revoked_at = now() WHERE company_slug = '<slug>' AND revoked_at IS NULL;`
- 회수 취소: `UPDATE report_pages SET revoked_at = NULL WHERE company_slug = '<slug>' AND version = <N>;`
- 열람 추정(browser 만, 같은 토큰 10분 내 1회 — 스크립트와 같은 규칙, A등급 아닌 추정치): `WITH RECURSIVE b AS (SELECT viewed_at, row_number() OVER (ORDER BY viewed_at) n FROM report_views v JOIN report_pages p USING (token) WHERE p.company_slug = '<slug>' AND p.version = <N> AND v.kind = 'browser'), c AS (SELECT n, viewed_at AS anchor, 1 AS cnt FROM b WHERE n = 1 UNION ALL SELECT b.n, CASE WHEN b.viewed_at - c.anchor >= interval '10 minutes' THEN b.viewed_at ELSE c.anchor END, c.cnt + (b.viewed_at - c.anchor >= interval '10 minutes')::int FROM c JOIN b ON b.n = c.n + 1) SELECT coalesce(max(cnt), 0) AS 열람_추정 FROM c;`

## 확인 순서 (게시 직후)

1. 스크립트 출력에 `게시: <slug> vN → …/r/xxxx…(masked)` 가 찍혔는가.
2. 회수 연습은 가짜 문서로만 한다 — 회수 뒤 같은 URL 이 404 인지.

## 한계

- **robots Disallow 와 noindex 가 부딪힌다.** robots.txt 가 `/r/` 를 막으면 규칙을 지키는 크롤러는 페이지를 받지 않으므로
  `X-Robots-Tag: noindex` 헤더도 보지 못한다. 링크가 외부(공개 게시판·메일 아카이브 등)에 새면 본문 없이 **URL 만 색인될 여지**가 있다.
  본문은 긁히지 않는다. 링크가 샜다고 의심되면 즉시 회수(위 SQL)한다 — 회수 뒤에는 404 다.
- **토큰은 평문 저장이다.** DB(`report_pages.token`)가 유출되면 링크도 같이 유출된다.
  **첫 주문 전에 sha256 해시 저장으로 바꾼다**(DB 에는 해시만, 전체 URL 은 게시 때 한 번만 보여 주는 방식).
- **열람 수는 추정치다.** 일반 브라우저 UA 를 쓰는 메일 스캐너는 browser 로 남고, Outlook 앱 안에서 연 사람은 bot 으로 빠질 수 있다.
