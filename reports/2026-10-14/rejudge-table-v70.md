| 후보 | v70 코드 | v70 라벨 예상/메모 | HTTP | 원문 robots(루트·우리 UA) | 근거 | crawl-delay(s) |
|---|---|---|---|---|---|---|
| KR1-01 디시인사이드 | SAMPLE | unknown·AI봇 신호 | 200 | allowed | Allow: / |  |
| KR1-02 블라인드 | SAMPLE | unknown(공개분만) | 200 | allowed | 일치하는 규칙 없음 |  |
| KR1-03 커리어리 | RETRY | 렌더 필요 | 200 | allowed | Allow: / |  |
| KR1-04 퍼블리 | SAMPLE | tos_risk(공개 글만) | 200 | allowed | Allow: / |  |
| KR1-05 티스토리 | REDEFINE | 개별 블로그 단위로 이관 | 404 | unverified | status=404 markup=true final=https://www.tistory.com/robots.txt |  |
| KR1-06 크몽 | SAMPLE | tos_risk | 200 | allowed | Allow: / |  |
| KR1-07 잡플래닛 | RETRY | 403 | 200 | allowed | 일치하는 규칙 없음 |  |
| KR1-08 MLBPARK | RETRY | (원문 대조: 전면 RD 후보) | 200 | disallowed | Disallow: / |  |
| KR1-09 네이트판 | SAMPLE | RD 전면·저속 | 200 | disallowed | Disallow: / |  |
| KR1-10 카페24 | SAMPLE | tos_risk 경계(앱 후기 구역) | fetch failed | unverified | request failed |  |
| KR1-11 메일리 | SAMPLE | tos_risk 경계 | 200 | allowed | 일치하는 규칙 없음 |  |
| KR1-12 원티드 | RETRY | 403 | 403 | unverified | status=403 markup=true final=https://www.wanted.co.kr/robots.txt |  |
| KR1-13 인스티즈 | SAMPLE | unknown·AI봇 신호 | 200 | unverified | 우리 UA 에 적용되는 User-agent 그룹이 없다 |  |
| KR1-14 SLR클럽 | SAMPLE | RD 전면·저속 | 200 | allowed / 내용경로 disallowed | Allow: /$ |  |
| KR1-15 사람인 | SAMPLE | 공개 구역만(로그인 안쪽 BLOCKED) | 200 | allowed | 일치하는 규칙 없음 |  |
| KR1-16 AI타임스 | SAMPLE | unknown | 200 | allowed | 일치하는 규칙 없음 |  |
| EN2-01 Chrome Web Store | SAMPLE | RD(리뷰 경로)·저속 | 200 | 부분 disallowed | 루트 허용, /detail/*/reviews·privacy·support 등 Disallow(리뷰 경로 RD 확인) |  |
| EN2-02 Edge Add-ons | RETRY | 렌더 | 200 | unverified | status=200 markup=true final=https://microsoftedge.microsoft.com/robot |  |
| EN2-03 Firefox AMO | SAMPLE | clear 가능성·최우선 후보 | 200 | allowed | Allow: / |  |
| EN2-04 Atlassian | SAMPLE | unknown(실제 앱 URL) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN2-05 HubSpot Marketplace | SAMPLE | tos_risk | 200 | allowed | Allow: / |  |
| EN2-06 Zapier | OUT | 리뷰 없음(1회 재확인) | 200 | allowed | Allow: / |  |
| EN2-07 SourceForge | SAMPLE | unknown(최근 글 비율) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN2-08 AlternativeTo | SAMPLE | tos_risk | 200 | allowed | 일치하는 규칙 없음 |  |
| EN2-09 SaaSworthy | RETRY | 403 | 200 | allowed | Allow: / |  |
| EN2-10 Slant | RETRY | 526·403 | 526 | unverified | status=526 markup=true final=https://www.slant.co/robots.txt |  |
| EN2-11 SoftwareSuggest | SAMPLE | RD(평점·프로필)·저속 | 200 | 부분 disallowed | /*/rating$ 등 Disallow(평점 경로 RD 확인) |  |
| EN2-12 Crozdesk | RETRY | 403·tos_risk | 200 | allowed | 일치하는 규칙 없음 |  |
| EN2-13 FinancesOnline | SAMPLE | tos_risk(새 정책 대표) | 200 | allowed | Allow: / |  |
| EN2-14 Sitejabber | SAMPLE | unknown(실제 URL) | 200 | unverified | status=200 markup=false final=https://www.smartcustomer.com/robots.txt |  |
| EN2-15 GitHub Issues | SAMPLE | tos_risk(공식 API 우선) | 200 | allowed (전문 재확인) | 이슈·토론 경로 허용, crawl-delay 1 | 1 |
| EN2-16 ProductReview.com.au | SAMPLE | unknown | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-01 Mastodon(mastodon.social) | SAMPLE | 인스턴스별 | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-02 Bluesky | RETRY | 공식 AT 프로토콜 API | 200 | allowed | Allow: / |  |
| EN3-03 Lemmy(lemmy.world) | SAMPLE | unknown·crawl-delay 60초 | 200 | allowed | 일치하는 규칙 없음 | 60 |
| EN3-04 Slashdot | SAMPLE | tos_risk 경계(일부 RD) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-05 Quora | SAMPLE | RD·저속(로그인 벽 시 BLOCKED) | 200 | disallowed (전문 재확인) | 전면 Disallow: / (Allow: /$ 만 예외) | |
| EN3-06 Medium | RETRY | 403 | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-07 Substack | SAMPLE | tos_risk(공식 RSS 우선) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-08 Tildes | SAMPLE | clear·robots_ai_signal | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-09 HubSpot Community | RETRY | 403 | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-10 Zoom Community | RETRY | 본문 잘림 | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-11 n8n | SAMPLE | unknown(Discourse JSON) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-12 Make | SAMPLE | unknown(Discourse JSON) | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-13 Airtable Community | SAMPLE | unknown | 200 | allowed | 일치하는 규칙 없음 |  |
| EN3-14 GitHub Discussions | SAMPLE | tos_risk(공식 API) | 200 | allowed (전문 재확인) | 이슈·토론 경로 허용, crawl-delay 1 | 1 |
| EN3-15 Telegram | SAMPLE | tos_risk(채널 선별) | 404 | unverified | status=404 markup=true final=https://t.me/robots.txt |  |
| EN3-16 Canny | SAMPLE | tos_risk(*.canny.io 보드) | 200 | allowed | 일치하는 규칙 없음 |  |
