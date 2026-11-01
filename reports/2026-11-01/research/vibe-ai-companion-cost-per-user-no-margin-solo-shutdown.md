# 조사 노트 — Vibe AI (slug: vibe-ai-companion-cost-per-user-no-margin-solo-shutdown)

조사일 2026-11-01 · 큐 사유 failure_quota · 시장 SaaS·1인/소규모 팀 소프트웨어 · 대상은 "미정"이라 직접 골랐다.

## 왜 이 사례인가
- 후보를 먼저 훑었다: Voiczy(polder.substack.com)는 1인칭 글이지만 서버가 403 이라 **본문을 못 열었다 → 확인 불가, 채택 안 함**(검색 요약만으로 케이스를 쓰지 않았다). Sibe.io 는 피벗 끝에 성공한 이야기라 실패 할당에 맞지 않아 뺐다. CodeParrot 은 1인칭 원문(LinkedIn)을 열지 못하고 기사 인용만 있어 뺐다. Juttu·College Conductor·Cydoc 는 이미 적립돼 있다.
- Vibe AI 는 1인 창업가가 직접 쓴 사후 글 3편을 전부 열어 읽을 수 있었다.

## 연 1인칭 출처 (3.5번 충족)
- https://gravity.fast/blog/vibe-ai-postmortem/ (2026-05-06) — 관찰→추론→행동 흐름이 나온다: 1주 차 강한 재방문 → 3주 차 꺾임 → 2026-01 가격 실험 전부 실패 → 스프레드시트와 일주일 씨름 → 2026-02 접음.
- https://gravity.fast/blog/three-startups-three-shutdowns (2026-05-05) — 3개 사업을 같은 3가지 시험으로 정리. Vibe AI 는 '남는 마진' 시험 탈락.
- https://gravity.fast/blog/the-honest-cost-of-three-shutdowns/ (2026-05-08) — 사업별 현금·포기 급여. Vibe AI 는 현금 2.1만 달러.
- 인용 문구는 각 페이지에서 원문 그대로 받은 문장이다(두 번째 fetch 로 재확인).

## 독자 축
- reader_problem: MAKE_BUT_NO_MONEY — 만들었고 사랑받았는데 돈이 안 남는 사람. 어휘에 "원가가 가격보다 크다"에 딱 맞는 코드는 없다(PRICE_TOO_LOW 는 '팔리는데 남는 게 없다'에 가깝지만 이 글은 값을 올려도 안 풀렸다). 억지 매핑 대신 기본 코드를 썼다.
- 병목: UNIT_ECONOMICS.
- 무브 3개 모두 outcome_direction=negative (이 사례는 교훈을 positive 로 돌리지 않았다).
  - PRICING: 사용자당 AI 사용료 ÷ 사용자 수 계산 (오늘 할 수 있음)
  - OPERATIONS: 접는 날짜·금액 기준을 6주 안으로 종이에 적기
  - PRODUCT_FEATURE: 가장 오래 쓰는 사용자의 비용과 짧게 쓴 사용자의 비용 비교

## 못 찾은 것 (전부 확인 불가)
- 가격 수준, 사용자 수, 재방문율 수치, 매출, 사용자당 비용, 팀 규모, 소재 국가. 글에 없다.
- 현금 2.1만 달러·포기 급여 6만 달러는 본인 집계(자기보고)이며 사업 매출 근거가 아니다. 무브의 metric 으로 쓰지 않았다(그래서 전부 등급 D, 사내 참고용).
- 3주 차 재방문이 왜 꺾였는지의 원인 분석은 글쓴이의 추론(구조적 신기함 곡선)이다. 별도 검증 자료 없음.
- 외부 독립 출처: 없음. 세 글 모두 같은 글쓴이의 같은 블로그라 독립 출처로 세지 않았다(observation_key 를 글·문장별로 분리했지만 같은 1인 자기보고다).
- 주의: 글쓴이는 후속 제품 Gravity 를 파는 블로그에 글을 올렸고, 글 안에서 Gravity 가 3가지 시험을 통과한다고 주장한다. 실패 기록의 사실 부분은 쓰되 그 주장은 가져오지 않았다.
- 지금 살아 있는지: 글 안에서 2026-02 종료라 outcome_status=shutdown (글쓴이 서술, 다른 확인 없음).

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에 AI 친구 앱·Vibe AI 프로젝트가 없다. 'MAKE_BUT_NO_MONEY' 일반 창업가 VOC 프로젝트는 있으나 이 브랜드의 주장을 직접 받치는 목소리가 아니라 붙이지 않았다. `voc_inputs` 는 전부 비워 뒀다.

## 이식성 참고
- 최근 14일 반려 사유 0건(참고 파일 확인). 이식성 판정은 쓰지 않았다.
- 사례 자체는 AI 사용료가 요청마다 드는 서비스에만 직접 해당한다. 그 외 독자는 OPERATIONS(접는 기준선) 무브가 가장 옮기기 쉽다.

## 자가검증 (_principles §0)
- 개선점 1: 처음엔 PRICING 무브에 금액을 넣으려 했으나 글에 가격이 없어 제거했다. 2: 무브 3에 '살아남는 설계' 처방을 더하려다 글에 없는 내용이라 뺐다. 3: 후속 제품 홍보 주장은 근거에서 제외했다.
- validate: 무브 3 · 근거 7 · error 0 · 경고 7(price_band 비어 있음 — 글에 없음 / 수치 없는 무브 D). exit 0.
