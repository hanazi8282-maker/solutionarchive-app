# 조사 노트 — yik-yak-college-only-awareness-cap

- slug: `yik-yak-college-only-awareness-cap`
- 병목: AWARENESS (큐 사유: failure_quota — 실패/피벗/철수 사례 할당분)
- 대상 선정: 큐에 브랜드가 미지정이라 직접 정했다. 이미 적립된 slug 목록(30건)과
  겹치지 않는 AWARENESS 실패 사례를 찾았다 — Yik Yak(익명 캠퍼스 소셜 앱,
  2013 창업 ~ 2017 폐업). 목록에 있는 `meerkat-twitter-api-awareness-collapse`
  (플랫폼이 API를 끊어 인지도 확산이 끊긴 사례)와는 메커니즘이 다르다 — Yik Yak은
  플랫폼이 막은 게 아니라 **스스로** 최대 확산 인구(10대)를 지오펜싱으로 배제했다.

## 무브 1건 — CHANNEL / 등급 C / outcome_direction=negative

10대(중·고생)로 앱이 퍼지며 살해·총격 위협·괴롭힘 사건이 터지자, 2014년 3월부터
Maponics 위치 데이터로 미국 중·고교 부지의 약 85%에 지오펜스를 걸어 그 연령대의
접근을 스스로 차단했다. 공동창업자 Buffington은 2016년 4월 컨퍼런스에서
"우리는 대학 시장에 있다, 상한이 있는 시장이다(capped market)"라고 이 선택을
직접 정당화했다 — 최대 잠재 확산 인구를 의도적으로 포기한 것이다.

수치: App Annie 추정 다운로드 2014-09 180만 건 → 2016-09 12만5천 건(93% 감소).
**등급 C인 이유**: 이 수치의 출처가 전부 App Annie 추정치(`is_estimate=true`)뿐이고,
법정 공시도 비자기보고 1차 출처도 없다. Yik Yak은 비상장으로 폐업해 공시가 없다 —
등급을 억지로 올릴 방법이 없고, 그게 정직한 결과다. `outcome_direction=negative`
+ 등급 C이므로 발행 게이트 통과 못 함(warn으로 표시됨, 정상 동작) — 사내 참고용.

**인과관계를 과장하지 않음**: 다운로드 급감 구간(2014-09~2016-09)에는 지오펜싱
외에도 (1) 2016-08 실명/전화번호 인증 도입으로 익명성 매력 상실, (2) 2016년
보안 연구자의 개인정보 노출 취약점 발견, (3) Snapchat 등 경쟁 앱으로의 이용자
이동이 동시에 있었다. claim에 이 confound를 명시했다 — 지오펜싱이 하락의
유일한 원인이라고 적지 않았다.

## 확인 못 한 것 (빈칸으로 두지 않고 명시)

- **Square 인수 관련 SEC 공시 원문**: TechCrunch가 "2017-04-16 SEC 공시"를
  인용하지만 원 공시 문서를 EDGAR에서 직접 찾아 열람하지 못했다 — Square의
  공시 서류를 특정하지 못함(확인 불가). 그래서 해당 근거는 `is_regulatory_filing:
  false`로 보수적으로 표시했다. 사람이 EDGAR에서 Square의 2017년 4-5월 8-K를
  뒤지면 원문 확인이 가능할 수 있다.
- **활성 사용자 수(Nov 2014 190만 → Mar 2017 26.4만, age 18+)**: Post and
  Courier 기사에 이 수치가 있었으나(WebFetch 요약 상), 어느 조사기관 데이터인지
  귀속이 불분명해서(App Annie와 같은 것인지 다른 소스인지 확인 못 함) draft에
  넣지 않았다 — 넣었다면 근거 없는 숫자를 만드는 것이었다.
- **매출/수익 모델**: Yik Yak은 폐업 시점까지 뚜렷한 수익화(광고 등)를 확정하지
  않은 것으로 보이나, "확정적으로 무수익이었다"를 뒷받침하는 출처를 별도로
  확인하지 않았다. `business_model`은 이런 이유로 D2C/SAAS 등 어느 쪽에도 맞지
  않아 `OTHER`로 두었다.
- **purchase_frequency / price_band**: 무료 앱이라 "구매 빈도"·"가격대" 개념
  자체가 안 맞는다. 억지로 어휘를 고르지 않고 `null`로 두었다(validate가 warn만
  내고 error는 안 낸다 — 매칭 축 공란은 검색 누락으로만 이어진다고 문서화됨).
- **2021년 재출시**: 다른 회사(Yik Yak Inc., 이후 Flower Avenue/Sidechat 합병)가
  브랜드를 인수해 재출시했다는 사실은 확인했지만, 이 draft의 `outcome_status`는
  2013~2017 원 법인 국면 기준 `shutdown`으로 고정했다 — 재출시는 별개 법인·별개
  국면이라 같은 케이스에 섞지 않았다.

## validate

`node scripts/case-research.mjs validate --slug yik-yak-college-only-awareness-cap`
→ **exit 0**. error 0건. warn 3건(모두 위에서 설명한 대로 예상된 것):
`purchase_frequency` 공란, `price_band` 공란, 부정 사례 등급 C(발행 불가·사내 참고용).

## DB 반영

하지 않음 — 이 세션에는 Supabase 자격증명이 없다. 적립(`case-review.mjs commit`)은
오케스트레이터가 한다.
