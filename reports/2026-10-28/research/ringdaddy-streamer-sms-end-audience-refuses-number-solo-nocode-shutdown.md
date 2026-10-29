# RingDaddy — 조사 노트 (실패 사례 할당분, 2026-10-28)

## 대상 선정
- 큐: SaaS 실패·피벗·철수 사례, 대상 미정(`failure_quota`). 기적립 slug 목록과 겹치지 않는 1인 창업 SaaS 종료 건을 찾았다.
- 버린 후보: Voiczy(polder.substack.com)·LeaderBird(kp.substack.com)·Indie Hackers 글은 WebFetch 403 이라 **확인 불가**. Cronhub 은 도메인 ENOTFOUND / 522, Papercups 공지는 404. 내용을 못 읽은 후보는 수치를 쓰지 않았다.
- 선택: RingDaddy (스트리머용 문자 마케팅, 브라질 1인 창업자 Isaac Medeiros, 2020, 노코드로 3일 만에 제작).

## 찾은 것
- 1인칭 출처 1건: Failory 인터뷰 https://www.failory.com/interview/ringdaddy (2021-04-06, 자기보고).
- 흐름: 스트리머 10명으로 출시 → 스트리머는 가치를 바로 이해 → 시청자가 전화번호를 주기 꺼림 → 처음엔 랜딩 페이지 신뢰 문제로 봄 → 두 번째 스트리머도 같음 → 한 달 안에 안 된다고 판단.
- 수치(전부 자기보고): 구독 매출 50달러("구독에 든 돈 100달러"는 뜻이 모호 — 도구 구독료로 추정되나 확인 불가). Twilio 단가 0.7센트/통, 구독자 200명·월 15회 가정 시 22.5달러(200×0.007×15 = 21달러라 창업자 계산에 반올림 오차가 있다. 원문 숫자를 그대로 적었다).
- 서비스 자체 가격 페이지(https://ringdaddy.webflow.io/pricing): Basic 첫 1개월 무료 후 월 10달러, 무제한 문자. 게재일은 확인 불가.
- Failory 노코드 실패 목록: 2020 설립·2020 종료, "Bad Market Fit", 브라질(같은 매체 → 독립 출처 아님, tertiary).
- 무브 3개: 2개 negative, 1개 mixed(템플릿 판매). 억지 교훈·positive 전환 없음.
- 독자 문제: `NO_FIRST_CUSTOMER`. 병목: `CONVERSION`.

## 못 찾은 것 (확인 불가)
- 시청자·가입자 수, 유료 스트리머 수, 템플릿 매출 금액, 종료한 정확한 월, 현재 서비스 상태(가격 페이지는 열리나 운영 여부는 확인 안 함).
- 창업자 본인 블로그·트위터, 독립된 2차 출처 — 없다. 인터뷰 한 건이 전부다.
- 관측 기간: 기간(2020-01-01~12-31)은 Failory 의 설립·종료 연도에서 가져온 상한이다. 수치가 정확히 언제 측정됐는지는 모른다.
- 인용 정확도 주의: 인터뷰 원문을 WebFetch 요약 도구로 읽었다. 스니펫 중 "personal thing"·"consistent problem" 은 도구가 paraphrase 로 표시했다 — 승인 전 원문 대조 필요.
- 무브 2(템플릿): 근거가 말 한 줄뿐이고 금액이 없어 사실확인 D. Webflow 쇼케이스 페이지는 복제본 수가 보이나 가격·판매 수를 알 수 없어 근거로 쓰지 않았다.
- 무브 0·1 은 자기보고 1차뿐이라 사실확인 C → 부정 사례 발행 기준(A)에 못 미친다. 사내 참고용이다.

## 어휘 메모
- reader-problems.json 7개 안에서 `NO_FIRST_CUSTOMER` 로 충분했다. 새 코드 제안 없음.
- 페인 낱말: 무브 0 "가입", 무브 1 "요금제·정액", 무브 2 "구독" 을 claim 에 넣었다(`config/pain-terms.json`).
- 이식성(transferability)은 쓰지 않았다(사람이 승인 때 고른다).

## 유사 기적립과의 차이
- 기적립은 대부분 "돈을 내는 사람이 없다"(유료 벽, 말로만 검증) 계열이다. 여기서 새 것은 "고객은 좋아하는데 고객의 고객이 개인정보(전화번호)를 안 준다"는 B2B2C 구조 문제와, 정액 무제한 요금제 vs 건당 원가 불일치다. 겹침이 크다고 판단되면 승인 단계에서 합치거나 버려도 된다.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에 RingDaddy·스트리머·문자 마케팅 프로젝트가 없다. 키워드 검색에서 나온 두 건(식당 문자 후기 HN 댓글, Tailscale 가격 댓글)은 주장을 뒷받침하지 않아 붙이지 않았다. 모든 무브의 `voc_inputs` 는 비워 뒀다.

## validate
- `node scripts/case-research.mjs validate --slug ringdaddy-streamer-sms-end-audience-refuses-number-solo-nocode-shutdown` → error 0건, 통과. 등급 A2(무브 0·1; 사실확인 참고 C) / C1(무브 2). 경고: 근거 2건 published_at 없음, 무브 0·1 부정 사례 사실확인 C, 무브 2 수치 없음 D.
