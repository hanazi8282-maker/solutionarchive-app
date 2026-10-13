# v70 L-03 다중 구역 표본 결과 (2026-10-14 새벽)

방법: 사이트당 서로 다른 구역 3곳 × 20건 제목/스니펫을 읽고 relevant(R) 개수를 센다(v70 §3). 조사 도구 WebFetch 는 요약 모델이라 **R 이 관대한 쪽으로 틀릴 수 있다**(상한으로 읽는다). 구역 URL 은 목록 링크를 따라 얻었고 추측하지 않았다. n8n·Make 는 Discourse JSON 을 직접 받아 제목으로 센 값이다(제목 기준 추정).
판정 규칙: 후보 = 평균 ≥40% 또는 한 구역 ≥60% · OUT = 3구역 모두 <25% 이고 평균 <15% · 그 사이 보류 · 접근 실패는 판정불가(RETRY). 표본이 3구역×20에 못 미친 곳은 "표본 부족"을 붙였다.

## 후보
- n8n 커뮤니티: 기능 요청 18/20 · 질문 16/20 · 만든 것 자랑 4/20 → 평균 63%, 최근 12개월 100%. Discourse JSON. 약관: "You may not automate access to the forum ... web crawler" → tos_risk 라벨 수집(E2E 소스, PR #517).
- Make 커뮤니티: 질문 ~15/20 · 초보 질문 ~11/20 · 아카이브 ~3/20 → 평균 ~48%. Discourse JSON. 약관 동일 문구(community.make.com/tos).
- SLR클럽: 유저사용기 11/20 · PC게시판 14/20 · 자유사용기 9/20 → 평균 57%, 전부 최근 12개월. **robots 전면 Disallow + 약관 Art.18⑥ "회사의 명시적 동의없이 수집, 복제..." 금지** → v70 정책으로 robots_disallowed+tos_risk 라벨·저속 수집 대상. 소비재(카메라·PC) 후보. R 이 구매 상담 질문에 치우쳐 과대일 수 있음. HTML 어댑터 필요.
- SourceForge: KeePass 13/20 · qBittorrent 9/20 · 3구역 못 채움 → 평균 ~55%(표본 부족). 데스크톱 소프트웨어 중심. 약관에 스크래핑·로봇 언급 없음(slashdotmedia.com/terms-of-use).
- AlternativeTo: Obsidian 7/8 · Joplin 11/15 (표본 부족). 약관: "scrape, crawl or bulk-download the site outside what our robots.txt allows" 금지 → robots 허용 범위 안이면 약관상 허용 해석 가능(조건부). 상업 이용은 사전 연락 필요.
- GitHub Issues: n8n 20/20 · nocodb 17/20 · appsmith 17/20. 개발자·기여자 목소리(버그·기능 요청)이고 구매자의 선택/이탈 이유와는 결이 다름. AUP 는 API 수집을 스크래핑에서 제외 → 공식 API 경로 권장.
- Airtable Community: Ask the Community 7/20 · Product Discussions 13/20 · Legacy Ideas 16/20 → 평균 ~45%. Legacy Ideas 는 대부분 6~12개월 전, 신규 아이디어는 별도 폼으로 이동. Discourse 아님(/latest.json 404) → HTML/전용 어댑터 필요. RSS 404. 약관에 스크래핑 문구 없음(airtable.com/tos §3 복제·재배포 금지).
- ProductReview.com.au: 웹호스팅 ~11/20 · VPN 16/20 · 디지털서비스 ~8/20 → 평균 ~58%. SaaS 구매자보다 소비자 서비스. 약관 미확인(/terms 404). HTML.
- Chrome Web Store: Apollo 8/10 · Scribe 7/10 · Zoom 6/10 → 70%이나 리뷰는 "Load more"(JS)라 렌더 필요 + robots 가 /detail/*/reviews Disallow + 약관 4.4.2 "by any means other than through the interface". needs_render → 보류.

## 보류
- 디시인사이드: AI갤 8/20 · 포토샵갤 2/20 · 노트북갤 3/20 → 평균 21%(최고 40%). 약관 제11·16조가 크롤링·AI 학습 수집을 명시 금지. 어댑터 없음.
- 블라인드: AI 토픽 8/20 · 나머지 0 → 약관 페이지 404(미확인), 본문은 앱 유도.
- Firefox Add-ons: 3/20 · 8/20 · 1/20 → 평균 ~15%, 최근 12개월 23%. 텍스트 리뷰 드묾.
- Atlassian(표본 5건)·HubSpot Marketplace(4건)·SoftwareSuggest(제품 3곳×3건): 표본 부족. SoftwareSuggest 는 약관 §14 "any automated means or form of data scraping" 명시 금지 + 평점 경로 robots Disallow.
- FinancesOnline: 15/15 · 18/20 · 4/20(엄격) 이나 자료가 2016~2021뿐(최근 12개월 0%). 약관 §9.1 스크래핑 금지.
- Sitejabber(→smartcustomer.com 301): Namecheap 12/20(엄격 8~12) · 0/20 · ~1~3/20. SaaS 전용 아님. 약관 §5 "scrape, or index any portion" 금지.
- GitHub Discussions: Budibase 12/20 · ToolJet 13/20 · Flowise 14/20 이나 거의 설치 오류 지원 질문 — 엄격하면 I.
- 메일리: 목록 12건 R 0, 작가 발행물이라 사용자 목소리 아님. 약관 Art.12① 복제 금지.
- Lemmy: selfhosted 5/19 · technology 1/20 · linux 1/20 → 평균 ~12%(OUT 쪽). API 확인됨(lemmy.world/api/v3/post/list), crawl-delay 60초.

## OUT
- 네이트판(0/20·0/20, 구역 1곳 미조사 — OUT 요건 3구역 미충족이라 사실상 OUT) · 인스티즈(0/20·1/20·3/8 → ~10~15%) · 사람인(기업리뷰 로그인 모달, 면접후기 0/10) · AI타임스(기사, 0/20×2) · Mastodon(1/20×3, 홍보·봇) · Tildes(1/20·0/20·0/20).

## 판정불가(RETRY / 접근·표본 실패 — 낮은 관련성이 아니다)
- 퍼블리(유료 큐레이션·목록 미렌더; 약관 제19조 스크래핑 금지) · 크몽(공개 후기 목록 경로 못 찾음) · 카페24(ECONNREFUSED 2회) · Slashdot(댓글 페이지 링크 못 얻음) · Quora(403 1회 후 중단, robots 전면 Disallow) · Substack(둘러보기 로그인벽·댓글 유료벽, 약관 스크래핑 금지 → 제외 권고) · Telegram(채널 못 찾음, 그룹은 미리보기 불가) · Canny(고객 보드 링크를 못 찾음, 자사 보드만 확인).

## 새로 발굴한 Discourse 포럼 (robots 허용·/latest.json 200, 2026-10-14)
- forum.bubble.io(help 39,605 · questions 10,337 · idea 2,525) · community.retool.com(app-building 6,185 · feature-requests 2,272) · community.glideapps.com(help-how-to 27,990 · feature-requests 3,364) · community.softr.io(ask 3,195 · feature-requests 917). 약관: Retool·Softr 는 Discourse 기본 약관(자동 접근 금지 문구), Glide 는 "crawls, scrapes, or spiders" 금지, Bubble /tos 는 본문을 못 읽음(미확인). 구역 표본은 다음 단계.
- 미해당: community.airtable.com·community.appsmith.com·community.zapier.com 은 /latest.json 404(Discourse 아님).
