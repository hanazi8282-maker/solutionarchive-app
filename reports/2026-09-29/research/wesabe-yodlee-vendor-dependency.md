# 조사 노트 — Wesabe (slug: wesabe-yodlee-vendor-dependency)

큐 사유: failure_quota (실패/피벗/철수 사례). 시장: SaaS·1인/소규모 팀. 대상 "미정" → WebSearch 로 직접 선정.

## 왜 Wesabe 인가

- 실패·철수 사례 할당분이고, 성공 사례로 대체하지 말라는 지시가 있었다. Wesabe 는 2010년 7월
  실제로 서비스를 종료한, 잘 문서화된 SaaS(개인 재무관리 웹앱) 실패 사례다.
- 창업자(공동창업자·후기 CEO) Marc Hedlund 가 종료 3개월 뒤 자기 책임을 인정하는 장문의
  포스트모템을 직접 썼고(2010-10), 이게 TechCrunch·CNN Money·American Banker 등에 널리
  재인용됐다 — 3.5번(사고의 흐름, 1인칭 출처) 요건을 채우기 좋은 재료다.
- 회피 목록(이미 적립된 55개 slug)에 없다.

## 독자 축

- **reader_problem = MAKE_BUT_NO_MONEY** — Wesabe 는 제품을 만들었고 심지어 2008년 말부터
  매출도 냈다. 문제는 "만들 줄 몰라서"가 아니라 그 매출을 회사를 지탱할 만큼 키우지 못했고,
  경쟁사가 쓰던 수익모델(광고·제휴)을 원칙적으로 거부한 채 시간을 보냈다는 것. 다른 7개
  코드 중 더 정확히 맞는 게 없어 이 기본값을 썼다.

## 무브 2개

1. **ONBOARDING / negative** — Yodlee(은행 데이터 자동연동 업체)와 제휴하지 않고 자체
   연동 시스템을 만들기로 한 결정. 관찰(Yodlee 는 경쟁자가 없고 2006년 당시 인수 실패·임원
   이탈로 사업이 무너지고 있었다) → 추론(단일 공급자에 회사를 묶을 수 없다) → 결정(자체
   구축) → 결과(Mint 출시 6개월 뒤에야 대체 시스템이 나왔고 그 뒤로도 한동안 미완성 —
   Mint 는 그동안 Yodlee 로 가입 즉시 자동 동기화 제공). Hedlund 본인이 훗날 "바꿨다면
   우위를 지켰을 두 가지 중 하나"로 꼽음.
2. **OFFER / negative** — 광고·제휴 수수료 등 경쟁사가 쓰던 통상적 수익모델을 "돈을 아끼게
   도와주는 서비스가 동시에 상품 구매를 유도할 수 없다"는 원칙으로 거부. 매출은 2008년 말에야
   시작됐고 2009-11~2010-07(약 9개월)은 매출만으로 운영했지만 "소규모 회사를 무기한 지탱하기엔
   근소하게 부족"했다(Hedlund 본인 표현).

두 무브 모두 `outcome_direction=negative` 로 정직하게 적었다. 교훈을 억지로 positive 로
돌리지 않았다.

## 수치·등급

- 두 무브 모두 정량 지표(before/after)가 없다 — 창업자 서술은 "9개월", "무기한 지탱엔
  근소 부족" 같은 상대적 표현뿐, 구체 매출 수치($ 단위)를 못 찾았다. **없는 수치를 지어내지
  않고** 서술로만 남겼다. `validate` 결과 두 무브 모두 등급 D(사실확인) — 이건 실패가 아니라
  "수치 근거가 없는 무브"의 정상 상태다. 부정 사례 + 등급 D 조합이라 발행 게이트(CG-2/이
  아카이브 규칙)상 발행 대기로 못 간다 — 사내 참고용으로만 남는다는 뜻이고, 이건 조사 단계의
  책임 밖이다.

## 사고의 흐름(3.5번) — 충족

Hedlund 의 1인칭 서술을 두 건의 재인용 경로로 확인했다:
- money.cnn.com/2010/11/16 (Yodlee 관련 CNN Money 기사가 Hedlund 블로그를 직접 인용)
- money.cnn.com/2010/10/04 (Hedlund 에세이 "Why Wesabe Lost to Mint" 를 CNN Money 가
  재게재)

두 인용 모두 관찰→추론→결정→결과의 흐름이 원문 인용구로 남아 있다(초안 evidence[] 참고).

## 확인 불가로 남긴 것 — 정직하게 보고

- **원문 블로그(blog.precipice.org/why-wesabe-lost-to-mint) 직접 접속 실패.**
  `WebFetch` 시도 시 `getaddrinfo ENOTFOUND blog.precipice.org` — 도메인 자체가 더 이상
  해석되지 않는다(호스팅 종료로 추정). 원문은 CNN Money 재게재본과 TechCrunch·American
  Banker·Medium 재인용으로만 확인했다.
- **money.cnn.com 두 URL 모두 `WebFetch` 직접 접속 시 3회 전부 HTTP 503.** 이건 "허용
  안 됨"이 아니라 "그 순간 도달 실패"다 — 봇 차단 가능성이 있다. 인용문 자체는 `WebSearch`
  가 두 차례 독립 질의에서 동일한 원문 인용구를 재현했고(질의 1: Yodlee 단일공급자 문구,
  질의 2: "did not believe"/"single-source provider" 재확인), TechCrunch(직접 fetch
  성공, HTTP 200)와 American Banker(직접 fetch 성공)가 같은 사실(Yodlee 회피, 매출 신화
  반박)을 독립적으로 교차 확인했다. **직접 fetch 로 금액·인용구 원문을 재확인하지는
  못했다** — 이 항목은 "확인 불가"로 남기고, 위 교차확인 근거로 초안에는 실었다.
  (§7.1: 확인 실패를 양성으로 접지 않기 위해 이 문단을 남긴다.)
- **정확한 가격구조·유료 티어 존재 여부는 확인 못 했다.** `price_band=LOW` 는 "매출이
  작았다"는 서술 기반 추정이지 요금표를 본 것이 아니다.
- **medium.com 재게재본은 WebFetch 403(로그인/봇 차단 추정)으로 직접 열지 못했다.**
  evidence 에는 넣지 않았다 — 검증 못 한 URL 을 넣지 않는다는 원칙을 따랐다.
- 미국 은행/신용조합 영업 실패, 온보딩 단계의 구체 정보요구량 비교(Wesabe vs Mint 가입
  단계 수) 등은 출처를 찾았으나(American Banker) 수치화된 비교가 없어 정성 서술로만
  move 1 근거에 반영했다.

## VOC

`ops/state/voc-inputs/index.md` 확인 — 개인 재무관리(PFM)·핀테크 SaaS 와 맞는 프로젝트가
없다(1Password 는 보안/패스워드 매니저로 인접하지만 핀테크가 아니다). **VOC 해당 없음** —
두 무브 모두 `voc_inputs` 를 비워 뒀다. 억지로 붙이지 않았다.

## validate 결과

`node scripts/case-research.mjs validate --slug wesabe-yodlee-vendor-dependency`
→ **error 0건, exit 0**. 경고(warning) 6건은 전부 예상된 것: 수치 없음(D 등급) × 2,
부정사례+D등급 조합(발행 불가, 사내참고용) × 2, `published_at` 미기재 × 2(Failory 집계
페이지·American Banker 기사 모두 게시일을 못 찾아 비워둠 — 지어내지 않았다).

## 요약 (보고 형식 — 항목당 한 줄)

- slug: wesabe-yodlee-vendor-dependency
- 독자 문제(reader_problem): MAKE_BUT_NO_MONEY — 만들고 매출도 냈지만 지탱할 만큼 못 키움
- 무브1 transfer_note: 핵심기능 자체구축이 밀리고 있으면 원칙보다 외부 API 우회를 먼저 검토해라
- 무브2 transfer_note: 원칙으로 배제한 수익원이 있다면 배제 전에 매출 기여분을 숫자로 계산해봐라
- 병목(case bottleneck): CONVERSION (자체 온보딩 미완성 vs Mint 자동동기화)
- 무브 수: 2 (둘 다 outcome_direction=negative)
- 각 무브 등급: D / D — 둘 다 정량 수치 근거 없음(서술만), 지어내지 않음. 부정사례+D 조합이라 발행 대기 불가·사내 참고용
- validate exit 코드: 0 (error 0건, warning 6건 — 전부 예상된 경고)
- 못 찾은 것: 원문 블로그 직접 접속 불가(도메인 소멸) · money.cnn.com 직접 fetch 3회 503(WebSearch 교차확인으로 대체) · 정확한 가격구조 미확인 · medium 재게재본 403 으로 미인용
