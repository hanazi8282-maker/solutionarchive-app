# UIPrompt — 구독→일회성 전환 후에도 구매 0건 (조사 노트, 2026-11-22)

큐 사유: failure_quota(실패·피벗·철수 할당). 대상은 "미정"이라 WebSearch 로 직접 골랐다.

## 독자 축 (먼저)
- reader_problem: NO_FIRST_CUSTOMER — 첫 유료 고객이 한 명도 안 생긴 1인 개발자가 "가격이 문제인가?"를 의심할 때의 사례.
- 병목: AWARENESS(불확실). 자연 가입 0명이라 인지·수요 쪽으로 두었지만, 방문자 수가 글에 없어 CONVERSION 인지 가를 수 없다.
- 핵심 한 줄: 가격 모델을 월 $12 구독 → $39 일회성으로 바꿔도 결과가 같은 0이면, 문제는 결제창 앞(수요)에 있다.

## 사실 (전부 창업자 본인 dev.to 글, primary·self-reported)
- 글 1 (2025-07-17) https://dev.to/yingyenliu/i-killed-my-saas-subscription-7-days-after-launch-heres-the-math-h3a
  - 월 $12 구독, 유료 전환 0, 출시 7일 만에 구독 철회.
  - 진단: 디자인 시스템 만드는 2주 집중 사용 뒤 다음 프로젝트까지 안 씀 → 월 결제와 불일치.
  - $39 일회성(이후 $59), 체험판 코드 108줄 삭제, 14일 환불.
  - 사전 기준: 재출시 14일 안에 구매 3건, 아니면 유지보수 모드.
- 글 2 (2025-07-31) https://dev.to/yingyenliu/i-gave-my-saas-14-days-to-get-3-sales-it-got-0-heres-the-math-541a
  - 구매 0, 자연 가입 0. Product Hunt·Show HN·홍보 영상·여러 디렉터리를 돌렸음.
  - 결론: "Pricing was never the binding constraint. Demand was." 플레이그라운드는 무료로 유지.

## 무브 3개와 등급 (validate 출력)
1. PRICING — 등급 A, 사실확인 참고 C. 부정 사례인데 사실확인 C → 발행 불가, 사내 참고용.
2. OPERATIONS(사전 중단 기준) — 등급 C, 수치 없음(D). outcome_direction=mixed: 기준대로 결정이 났다는 것은 창업자 서술뿐.
3. CHANNEL — 등급 A, 사실확인 참고 C. 위와 같이 발행 불가.
- validate: 에러 0건, "전부 통과" 출력. (※ 종료 코드를 따로 찍지는 못했다 — 한 줄 명령만 허용돼 `echo $?` 를 붙이지 못함. 출력 문구로 판단.)

## 못 찾은 것 (확인 불가 — 0 이 아니다)
- 방문자·유입·가입 퍼널 수치, 매출, 구매 대상 독자 정의.
- 두 번째 글 이후의 후속 소식과 현재 서비스 상태(live 라는 건 2025-07-31 창업자 서술).
- 제3자 보도·독립 관측 — 전부 자기보고 1차뿐이라 사실확인 C.
- 구독 → 일회성 전환이 효과가 있었는지는 비교군이 없어 말할 수 없다. 이 사례가 보여 주는 건 "전환해도 0 이었다"까지다.

## 한계 / 주의
- 14일·0건은 작은 표본이다. "수요가 없다"는 창업자의 해석이지 측정이 아니다.
- 안전장치(14일 기준)가 걸려 끝난 사례라 §7.2 에 따라 기준이 걸렸다는 사실이 "수요가 없다"의 증명은 아니다 — 유입이 거의 없었을 가능성(채널 실패)을 배제하지 못한다. 그래서 무브 3을 따로 두었다.

## VOC
VOC 해당 없음. `ops/state/voc-inputs/index.md` 에서 UIPrompt·구독 가격 전환과 직접 맞는 프로젝트가 없었다. SaaS 창업자 일반 고통 프로젝트 5개(9fece18e·cd0a1a19·d62f3caa·e819f101·ee68cb68)는 훑었으나, 가격 모델 전환을 말하는 목소리가 없어 억지로 붙이지 않았다. 인덱스 끝 245줄은 읽지 못했다.

## 탈락한 후보 (참고)
Zeabur·Mantle·Standard Notes Listed·Frobocode·Meta Blocks·Pinkary·Voiczy·LeaderBird·WAMessages·RevFixr — 이미 적립됐거나 1인칭 출처·수치가 없거나 SaaS 가 아니거나 실패가 아니라서 제외.
