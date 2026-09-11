# HN 실패신호 후보 대기열

이 파일은 자동 생성된 **후보 목록**이지 확정된 실패 사례가 아니다.
`scripts/hn-failure-signal-log.mjs` 가 이미 수집한 HN 댓글 본문에서 강한 다단어
실패 신호 구문을 찾아 여기에 쌓는다. DB 에는 아무것도 쓰지 않는다.

사람이 읽고 진짜 실패 사례라고 판단한 것만 `docs/failed-angles.md` 표로 직접
옮긴다. 옮긴 뒤 `scripts/failed-angles-sync.mjs` 가 `failed_angles` 로 upsert 한다.

## HN 49137620

- 매칭: `we shut down`
- 원본: https://news.ycombinator.com/item?id=49137620
- 검색 맥락: q:"we shut down" (Algolia search_by_date, 2026-09-11)
- 스레드: Reddit Stock Collapses 23% as AI Eats Away at User Growth
- 작성자: AndrewKemendo
- 작성일: 2026-08-01

> I started/run a old and moderately popular sub (top 100 in sports) and haven’t noticed any issues that we haven’t dealt with before. We shut down during the blackout so it’s not like it’s all been easy. I got stock a couple years ago, that’s about it and I thought that was nice having been on Reddit since 2006 or whatever. That said we’re not a trash sub and take moderation extremely seriously.
