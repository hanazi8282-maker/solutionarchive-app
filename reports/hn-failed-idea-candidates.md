# HN 실패신호 후보 대기열

이 파일은 자동 생성된 **후보 목록**이지 확정된 실패 사례가 아니다.
`scripts/hn-failure-signal-log.mjs` 가 이미 수집한 HN 댓글 본문에서 강한 다단어
실패 신호 구문을 찾아 여기에 쌓는다. DB 에는 아무것도 쓰지 않는다.

사람이 읽고 진짜 실패 사례라고 판단한 것만 `docs/failed-angles.md` 표로 직접
옮긴다. 옮긴 뒤 `scripts/failed-angles-sync.mjs` 가 `failed_angles` 로 upsert 한다.

각 블록의 `- 판정:` 줄이 사람의 결론이다. `(미검토)` 면 아직 안 읽은 것이고,
`채택` 은 `docs/failed-angles.md` 로 옮긴 것, `기각(오탐)` 은 읽고 버린 것이다.
**기각한 블록도 지우지 않는다** — `## HN <id>` 머리글이 중복 방지 키라(
`lib/review/failure-signal.ts` `existingObjectIds`), 지우면 다음 실행이 같은
댓글을 다시 올린다.

## HN 49137620

- 판정: **기각(오탐)** — 2026-09-16 재검토. `we shut down` 이 걸렸지만 닫은
  대상이 제품·서비스가 아니라 **서브레딧**이고, 문맥(`during the blackout`)상
  Reddit 블랙아웃 기간의 일시적 비공개 전환이다. 창업자가 사업을 접었다는
  진술이 아니므로 `docs/failed-angles.md` 로 옮기지 않는다.
- 매칭: `we shut down`
- 원본: https://news.ycombinator.com/item?id=49137620
- 검색 맥락: q:"we shut down" (Algolia search_by_date, 2026-09-11)
- 스레드: Reddit Stock Collapses 23% as AI Eats Away at User Growth
- 작성자: AndrewKemendo
- 작성일: 2026-08-01

> I started/run a old and moderately popular sub (top 100 in sports) and haven’t noticed any issues that we haven’t dealt with before. We shut down during the blackout so it’s not like it’s all been easy. I got stock a couple years ago, that’s about it and I thought that was nice having been on Reddit since 2006 or whatever. That said we’re not a trash sub and take moderation extremely seriously.

## HN 49682506

- 판정: (미검토)
- 매칭: `we shut down`
- 원본: https://news.ycombinator.com/item?id=49682506
- 검색 맥락: 자동 스윕 · 구문 9개 · 최근 7일 (Algolia search_by_date, 2026-09-16 UTC)
- 스레드: Dramatic insider warnings over AI fall flat with some in Silicon Valley
- 작성자: hypendev
- 작성일: 2026-09-13

> Why are you looking to control a superintelligence? Why do you assume bad things will happen otherwise? Why does every doomer scenario assume that this, highly intelligent being, will be - unlike all other highly intelligent beings - especially hell bent on destroying humanity/treating it as a resource/destroy earth looking for energy? We have no clue about superintelligence, yet we can look at existing patterns in the real world around us. Higher intelligence inversely correlates with violence.…

## HN 49675442

- 판정: (미검토)
- 매칭: `we failed`
- 원본: https://news.ycombinator.com/item?id=49675442
- 검색 맥락: 자동 스윕 · 구문 9개 · 최근 7일 (Algolia search_by_date, 2026-09-16 UTC)
- 스레드: Teen reading slumps to worst this century due to surge in screen time
- 작성자: techblueberry
- 작성일: 2026-09-12

> Because they weren’t held back in school? Not… you know…. Gestures everywhere But really, if we failed the first time, what makes you think we’ll be more successful the second?

## HN 49649960

- 판정: (미검토)
- 매칭: `pivoted away from`
- 원본: https://news.ycombinator.com/item?id=49649960
- 검색 맥락: 자동 스윕 · 구문 9개 · 최근 7일 (Algolia search_by_date, 2026-09-16 UTC)
- 스레드: Silicon Valley is transforming the military-industrial complex? (2024)
- 작성자: JumpCrisscross
- 작성일: 2026-09-10

> > it’s still the same organization maintaining the same mission operating under the same budget WWII demonstrated wars of conquest don't work in the industrial age. When America and its Department of War and Navy were founded, invasion and conquest could still be done profitably. WWII showed that was no longer true–industrial machinery and skilled workers are destroyed by invasion and even base resources quickly become useless when surrounded by people who hate you. (Nuclear weapons sealed the e…

## HN 49749833

- 판정: (미검토)
- 매칭: `we shut down`
- 원본: https://news.ycombinator.com/item?id=49749833
- 검색 맥락: 자동 스윕 · 구문 9개 · 최근 7일 (Algolia search_by_date, 2026-09-18 UTC)
- 스레드: Why I didn’t sign the Fields medallists’ letter
- 작성자: Dylan16807
- 작성일: 2026-09-18

> > And if calculus was the only useful thing to come out of 1600s mathematical research, it would have been worth it. The other dead ends don't need to justify themselves. Getting one thing of this magnitude justifies it all It would have been worth what? Doing mathematical research at all? Nobody is suggesting we shut down mathematical research. It doesn't justify a funding system that didn't exist / didn't fund those researchers. We need to come up with better reasons to fund such a thing.
