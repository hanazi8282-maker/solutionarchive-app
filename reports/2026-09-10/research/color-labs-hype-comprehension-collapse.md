# 리서치 노트 — Color Labs (color-labs-hype-comprehension-collapse)

큐 사유: failure_quota (실패/피벗/철수 할당분). 병목: AWARENESS. 대상은 미정이었고,
기존 적립 slug 목록에 없는 것으로 직접 선정했다.

## 왜 Color Labs 인가

AWARENESS 병목 실패 사례 중 "브랜드 인지도(펀딩 뉴스로 유명해짐)"와
"제품 인지도(뭘 하는지 이해시킴)"가 분리된다는 걸 숫자로 보여주는 사례를 찾았다.
2011년 3월 출시 전 4100만 달러(세쿼이아 역대 최대 프리론치 투자) 소식만으로
전방위 보도를 만들어냈지만, 그 보도량이 실제 제품 이해로 전환되지 않았고
출시 직후 평점 1~2점대·유령 도시 체감으로 무너졌다. 2012년 10월 청산,
같은 해 11월 애플에 엔지니어링 팀만 700만 달러에 인수. 실패·철수가 명확하고,
`outcome_direction=negative` 를 그대로 유지했다 — 교훈을 만들어 positive 로
돌리지 않았다.

## 찾은 것

- **무브 0 (POSITIONING, negative, 등급 C)** — 출시 전 보도가 제품보다 조달액
  중심이었다는 것, 출시 이틀 뒤 앱스토어 평점이 1~2점대였다는 것. 근거:
  TechCrunch 2011-03-23 최초 보도(펀딩 프레이밍, 저자 자신도 제품 이해에
  불확실성 표명), thelettertwo.com 2011-03-25(평점 1~2점대 및 UX 혼란 직접 인용).
  둘 다 secondary·비자기보고·비추정이지만 같은 원 관측(평점 수치)을 확인해 주는
  게 thelettertwo 1건뿐이라 교차 확인 요건(원 관측 2개)을 못 채워 A 가 아니라 C.
- **무브 1 (PRODUCT_FEATURE, negative, 등급 C)** — 근접 기반 기능이 실제로는
  "유령 도시"로 체감됐다는 서술(TechCrunch 2011-06-20)과, 다운로드 100만 건 →
  2011년 9월 월간활성 10만 명 미만(Wikipedia 집계)이라는 수치. Wikipedia 는
  3차·추정치로 표시했다 — 회사가 공식 공시한 MAU 가 아니라 언론이 사후적으로
  집계한 숫자다.
- **무브 2 (PARTNERSHIP, negative, 등급 C)** — 2011년 9월 페이스북 연동 피벗
  이후에도 회복하지 못하고 2012년 10월 청산 의결(VentureBeat 유출 이메일 보도,
  회사는 공식 부인) → 같은 해 11월 애플에 700만 달러로 엔지니어링 팀만 인수
  (TechCrunch, 소송을 통해 확인된 최종가 — 초기 보도된 250만~500만 달러보다 높음).
  누적 조달액 4100만 달러 대비.

## 못 찾은 것 (확인 불가로 남긴 것)

- **App Store 평점의 정확한 숫자.** 여러 매체가 "1~2점대"라고만 썼고, 정확한
  소수점 평점이나 리뷰 수를 명시한 1차 자료(App Annie/Sensor Tower 등)는
  찾지 못했다. `metric_after=2`는 보도된 구간의 상단값이라고 근거 스니펫에
  명시했다 — 정확한 단일 수치인 것처럼 적지 않았다.
- **2011년 9월 MAU 10만 명 미만의 원 출처.** Wikipedia 가 인용하는 1차 기사를
  못 찾았다. Wikipedia 자체를 tertiary·is_estimate=true 로 낮춰 적었고, 그래서
  이 무브는 등급이 C 에 머문다 — 실측 출처가 있었다면 다른 결과였을 것이다.
  `published_at` 도 확인 못 해 비워뒀다(경고로 남음).
- **애플 인수가의 최종 확정 여부.** TechCrunch 11월 보도는 "소송을 통해 확인"
  이라고 밝혔지만, 애플·Color 양측의 공식 확인은 없었다. 이 자체가 비상장
  인수라 공시 의무가 없기 때문으로 보인다 — 판단 불가가 아니라 애초에
  공개될 성격의 정보가 아니다.
- **outcome_status.** `shutdown` 으로 적었다 — 2012년 10월 이사회 청산 의결과
  12월 31일 서비스 종료 공지, 11월 자산 인수까지 세 소스가 일관되게 확인된다.
  `active`로 적을 근거는 없었다.

## 자가검증 (ops/roles/_principles.md §0)

- 더 효과적인 방법이 있었나 — 성공 사례로 치환하는 것은 큐 사유(failure_quota)를
  무력화하므로 배제. 브랜드도 스스로 바꾸지 않았다(지시 위반이 됨).
- 더 효율적인 방법이 있었나 — 무브 3개 모두 서로 다른 시점(출시/6개월 후/18개월 후
  청산)의 관측이라 하나로 합치지 않았다. 합쳤다면 근거 대조가 불투명해졌을 것이다.
- 개선점 — MAU 수치(무브 1)가 3차·추정치에 의존한다는 게 가장 약한 지점이다.
  1차 집계 서비스(App Annie 등)를 확인하면 등급이 올라갈 여지가 있다. 다음
  담당자가 채울 수 있도록 "못 찾은 것"에 명시했다.

## 검증

`node scripts/case-research.mjs validate --slug color-labs-hype-comprehension-collapse`
직접 실행 — error 0건, `✅ 전부 통과` 출력 확인 (exit 0). warn 4건은 남겨뒀다:
- evidence[3].published_at 미기재 (Wikipedia, 원문 게시일 확인 불가)
- moves[0..2] 모두 "부정 사례인데 등급 C — 발행 불가, 사내 참고용" — 의도된
  상태다. 억지로 A 로 올리지 않았다.

## 결과 요약

- slug: `color-labs-hype-comprehension-collapse`
- 병목: AWARENESS
- 무브 수: 3 (POSITIONING/negative/C, PRODUCT_FEATURE/negative/C, PARTNERSHIP/negative/C)
- validate: exit 0 (error 0, warn 4 — 전부 위에 기술한 의도된 경고)
- DB 미적립 — 오케스트레이터가 처리한다.
