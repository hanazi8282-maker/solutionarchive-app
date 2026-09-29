# 소스 사람 판단 큐

새 VOC 소스·게시판 중 **법적 점검(`docs/review-collection-design.md` §1.2)을 깨끗하게 통과하지 못한 것**만 여기 올린다.
깨끗한 것은 세션이 바로 등록 마이그레이션을 낸다(CLAUDE.md §10.1, 남헌 2026-09-30). 여기 있는 것은 사람이 판정하기 전까지 수집하지 않는다.

- 한 줄 = 한 소스. 형식: `상태 | 소스(URL) | 걸린 항목 | 근거 원문(robots·약관 인용) | 등록하려면 필요한 것 | 올린 날·세션`
- 상태: `대기`(사람 판정 전) · `승인`(→ 등록 마이그레이션 번호를 적는다) · `반려`(사유)
- 반려가 명백한 것(robots 금지 · 로그인 필수)은 큐에 올리지 않고 아래 "반려 기록"에만 남긴다 — 같은 조사를 반복하지 않으려는 기록이다.
- 판정을 바꿀 새 사실(약관 개정 · robots 변경)이 생기면 그 줄을 고치고 날짜를 붙인다. 지우지 않는다.

## 대기

- 대기 | dev.to (DEV Community) | 약관 — 상업적 이용·복제 금지 | robots 허용(`*` 는 /search?q=·/admin 등만 Disallow). 약관 §2 "Permission is granted to temporarily download one copy of the materials … for personal, non-commercial transitory viewing only … you may not: modify or copy the materials; use the materials for any commercial purpose" | 공개 API(Forem `/api/articles?tag=`)에 별도 약관이 있는지, 사내 분석용이 "commercial purpose" 인지 사람 판정. 승인 시 새 어댑터(태그 목록 JSON + 댓글 JSON, 약 1일) | 2026-09-30 autonomous-source-discovery
- 대기 | Indie Hackers (indiehackers.com) | 약관 — 소유자 동의 없는 이용·복제 금지 | robots `*` 전체 허용(GPTBot·Google-Extended 만 Disallow). 약관 "you won't use, copy, reproduce … or otherwise exploit for any purpose any Content not owned by you, (i) without the prior consent of the owner of that Content" | 사람 판정. 승인돼도 Ember/Firebase CSR 이라 정적 GET 으로 본문이 오는지 실측이 먼저(1~2일) | 2026-09-30 autonomous-source-discovery
- 대기 | Hashnode (hashnode.com) | 약관 — API 수집 금지 + 스크래핑 조건부 | robots 허용(`/api/` 등만 Disallow). 약관 "Scrape, crawl, or use automated means to access the Service in a manner that exceeds reasonable use or violates these Terms." / "Use the API to collect or harvest data from publications you do not own or have authorization to access." | API 경로는 금지로 읽힌다. HTML 저부하 수집이 "reasonable use" 인지 사람 판정. 승인 시 새 어댑터(약 1일) | 2026-09-30 autonomous-source-discovery
- 대기 | 아이보스 (i-boss.co.kr) — 창업 정보·무료 툴 공유·쇼핑몰 운영 게시판 | 약관 — 영리목적 복제 금지 · Cloudflare | robots `*` 는 이미지 파일 몇 개만 Disallow. 약관(/ab-policy) "아이보스 또는 제공업체에 지적재산권이 귀속된 정보를 … 사전승낙 없이 복제, 전송, 출판, 배포, 방송 기타 방법에 의하여 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다." /ab-agreement 는 비로그인 "열람 권한이 없습니다" + Cloudflare 챌린지 스크립트 | 이용자 글이 "아이보스 귀속 정보"에 드는지 사람 판정. 독자 겹침은 중간(마케터 중심) | 2026-09-30 autonomous-source-discovery
- 대기 | 요즘IT (yozm.wishket.com) | robots 확인 불가 | `GET /robots.txt` → HTTP 302 Cloudflare("302 Found … cloudflare") — 규칙을 못 읽었다(§7.1: 허용 아님) | 다른 경로·시간대로 robots 재실측. 에디토리얼 기사 중심이라 VOC 가치는 낮다 — 재실측 우선순위 낮음 | 2026-09-30 autonomous-source-discovery
- 대기 | 인프런 커뮤니티 (inflearn.com/community) | 약관 확인 불가 | robots `*` 는 /community 를 막지 않는다(`/community/*?*tag=*,` 복수 태그 조합만 Disallow). 약관 /policy/terms-of-service 는 CSR 이라 평문 54자 — 조항을 못 읽었다 | 약관 평문 확보(다른 URL·PDF). 수강 Q&A 중심이라 독자 겹침 낮음 | 2026-09-30 autonomous-source-discovery

## 등록 가능 판정 — 어댑터 대기(큐 아님, 기록용)

- GeekNews (news.hada.io) — Show GN·Ask GN·토픽 댓글. robots: `*` 는 `Allow: /` + `/api/`·`/comments/comment`·`/comments/topic`·`/login` 등만 Disallow(학습용 봇 그룹은 `Disallow: /`, `Content-Signal: ai-train=no, search=yes, ai-input=yes`). 약관 제6조 금지행위 "서비스에 과도한 부하를 주는 자동화 접근, 크롤링, 스크립트 실행 행위" — **조건부 금지**라 §1.2-2 에 따라 저부하(일 수십 요청·간격 5초+)로 등록 가능. 로그인 불필요, 개인정보 적음. 새 어댑터 필요(목록 `/show`·`/ask` + `/topic?id=` 댓글 HTML, 약 1~1.5일). ⚠️ `/topic?id=` 는 쿼리형 경로 — 러너 robots 판정이 pathname 만 본다(SP-026). 지금 robots 에 쿼리 규칙이 없어 문제 없지만 어댑터 머리말에 적을 것. 우리 용도는 학습(ai-train)이 아니라 분석 입력이다.

## 반려 기록

- Reddit (r/SaaS · r/indiehackers 등) — robots `User-agent: * / Disallow: /` + Public Content Policy. HTML 수집 불가. 공식 Data API 는 앱 등록·상업 이용 승인 필요(자격증명 미발급, 기존 기록) — API 경로를 열려면 별도 사람 결정.
- Startups Stack Exchange (startups.stackexchange.com) — robots HTTP 418 + `User-agent: * / Disallow: /`, `Content-signal: search=no, ai-train=no`.
- Lobsters (lobste.rs) — robots `User-agent: * / Crawl-delay: 1 / Disallow: /`.
- G2 (g2.com) — 약관 "you may not access, copy, extract, reproduce, scrape, store, distribute, or use Derived Data without G2's express prior written permission" / "You agree not to modify, copy, distribute … any such content obtained from or through this Site."
