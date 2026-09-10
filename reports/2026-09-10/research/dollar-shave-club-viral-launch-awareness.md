# 리서치 노트 — Dollar Shave Club (dollar-shave-club-viral-launch-awareness)

큐 사유: coverage_gap ("AWARENESS 승인 케이스 2곳 — 매칭 성립에 3곳이 필요하다"). 병목: AWARENESS,
성공 사례. 대상은 미정이었고, 기존 적립 slug 목록(23개, elf-beauty-awareness-engine·
gopro-ugc-viral-awareness·notion-template-gallery·nubank-word-of-mouth-acquisition·
figma-non-designer-distribution 등 AWARENESS 인접 사례 포함)에 없는 브랜드로 직접 선정했다.
같은 세션에서 방금 적립된 `color-labs-hype-comprehension-collapse`(AWARENESS 실패 사례)와도
겹치지 않는다.

## 왜 Dollar Shave Club 인가

AWARENESS 병목을 **성공적으로** 돌파한, 숫자로 뒷받침되는 사례가 필요했다. Dollar Shave Club은
2012년 사전 브랜드 인지도가 전무한 신생 구독 면도날 스타트업이 제작비 4,500달러짜리 영상 1개로
Gillette가 지배하던 시장에서 하루 만에 전국적 주목을 얻고, 이후 4년 만에 유니레버에 인수된
가장 교과서적인 "콘텐츠 1개 → 인지도 → 매출" 사례다. 동시에 수치 대부분이 창업자 본인의
자기보고라는 함정이 뚜렷해서, 등급을 과장하지 않고 정직하게 낮추는 훈련도 됐다.

## 찾은 것

- **무브 0 (CONTENT, positive, 등급 C)** — 2012-03-06 출시 당일 사이트 다운, 창업자 진술
  "48시간 12,000건 주문". 근거 2건(Inc. 2015-06-23, NBC 2012-10-16)이 시점은 다르지만 결국
  같은 창업자 진술로 귀결되는 **같은 원 관측**이라 `observation_key`를 동일하게 부여했다 —
  그래서 검증기가 "독립 원 관측 0개"로 낮춰 C를 줬다. 억지로 다른 키를 붙여 등급을 올리지 않았다.
- **무브 1 (CONTENT, positive, 등급 A)** — 테크크런치가 서로 다른 두 시점(2012-11-01, 2013-06-04)에
  유튜브 공개 조회수 카운터를 직접 관찰해 보도(700만 회 → 1000만 회 이상). 회사 자기보고가 아닌
  기자의 직접 관찰이라 `is_self_reported=false`, 서로 다른 원 관측 2개라 등급 A.
- **무브 2 (PARTNERSHIP, positive, 등급 C)** — 매출 400만 달러(2012, 두빈 자기보고, Fortune
  2016-05-16) → 1억5200만 달러(2015, 유니레버·DSC 공동 발표문, Retail Dive 2016-07-21이 재인용)로
  성장. 유니레버 SEC Form 6-K(2016-07-20)로 인수 계약 체결 발표일은 법정 공시로 확인했지만,
  그 문서 안에는 매출·인수가 수치가 없어 `supports_metric=false`로 처리했다 — 공시 문서가 있다고
  그 안에 없는 수치까지 A로 밀어붙이지 않았다. 결과적으로 매출 수치는 자기보고 2건뿐이라 C.

## 못 찾은 것 (확인 불가로 남긴 것)

- **주문 12,000건의 제3자 검증.** 결제 대행사 집계, 재무 감사, 공시 어디에도 이 숫자를 독립
  검증한 자료를 찾지 못했다. DSC는 2016년 인수 전까지 비상장이라 공시 의무가 없었다 — 판단
  불가가 아니라 애초에 공개될 성격이 아니었을 가능성이 높다.
- **인수가 10억 달러의 공식 확인.** 유니레버·DSC 어느 쪽도 공식 발표하지 않았다. Fortune
  (2016-07-19)이 "거래에 정통한 복수 소식통"을 인용한 미확인 보도치이며, `is_estimate=true`로
  명시하고 매출 before/after 수치에는 포함하지 않았다.
- **2015년 매출의 원 출처(유니레버 1차 발표문 원문).** unilever.com에서 2016-07-20 발표 당시의
  보도자료 원문 페이지를 직접 찾지 못했다(현재 unilever.com에는 그 시점 press release가 남아있지
  않은 것으로 보임). Unilever의 공식 Form 6-K(SEC)는 확인했지만 그 안에는 매출 수치가 없다.
  그래서 매출 수치의 출처는 이 발표를 재인용한 Retail Dive로 남겼고, 자기보고로 분류했다.
- **3.2백만 멤버 수의 관측 시점.** 여러 매체가 "3.2 million members"를 언급하지만 정확히 언제
  집계된 숫자인지 특정하지 못해 이번 초안에는 넣지 않았다.
- **outcome_status.** 2023년 유니레버가 지분 대부분을 Nexus Capital에 매각(35% 잔류)한 뒤에도
  2025~2026년 현재 Nexus 산하에서 (본사 이전·CEO 교체를 거치며) 계속 운영 중임을 확인했다 —
  `active`로 적을 근거가 있다. 다만 Forbes(2025-11-05)가 "fallen unicorn"으로 표현할 만큼
  유니레버 인수 이후 브랜드 정체성이 약화됐다는 점은 이번 케이스의 관측 기간(2012~2016) 밖이라
  moves에는 반영하지 않았다.

## 자가검증 (ops/roles/_principles.md §0)

- 더 효과적인 방법이 있었나 — "실패 사례"로 치환하는 것은 큐 사유(coverage_gap, 성공 사례 요청)를
  무력화하므로 배제. 이미 실패 사례(Color Labs)를 같은 세션에서 다뤘으니 AWARENESS 매칭 축의
  성공/실패 균형을 맞추는 게 더 유효하다고 판단했다.
- 더 효율적인 방법이 있었나 — 창업자 자기보고 수치(주문·매출)와 제3자 직접 관찰 수치(조회수)를
  분리해서 별도 무브로 만들었다. 합쳤다면 등급이 서로 다른 근거가 한 무브에 섞여 어느 쪽이
  A/C를 만드는지 불투명해졌을 것이다.
- 개선점 — 무브 0·2가 모두 창업자 자기보고에 의존해 C에 머문다는 게 가장 약한 지점이다. 결제
  대행사 집계나 감사받은 재무제표(비상장 시절이라 존재 여부 자체가 불확실)를 찾으면 등급이
  오를 여지가 있다. 다음 담당자가 채울 수 있도록 "못 찾은 것"에 명시했다.

## 검증

`node scripts/case-research.mjs validate --slug dollar-shave-club-viral-launch-awareness`
직접 실행 — error 0건, `✅ 전부 통과` 출력 확인 (exit 0, `&&` 체이닝으로 종료 코드 확인).
등급 분포: A 1 / B 0 / C 2 / D 0.

## 결과 요약

- slug: `dollar-shave-club-viral-launch-awareness`
- 병목: AWARENESS (성공 사례)
- 무브 수: 3 (CONTENT/positive/C, CONTENT/positive/A, PARTNERSHIP/positive/C)
- validate: exit 0 (error 0, 등급 A1·B0·C2·D0)
- DB 미적립 — 오케스트레이터가 처리한다.
