# 조사 노트 — fab-com-curation-retention-collapse (Fab.com)

큐 사유: `failure_quota` (RETENTION 병목, 실패/피벗/철수 사례 할당분). 대상 미정 → 직접 선정.

## 대상 선정

이미 적립된 slug 목록(33개)을 확인 — 대부분 AWARENESS/CONVERSION/UNIT_ECONOMICS 계열이고
RETENTION 병목의 **실패** 사례는 없었다. Fab.com(2011~2015, 디자인 상품 플래시세일)을 선정했다.
큐레이션 축소 + 재구매 무관심이라는 명확한 RETENTION 실패 서사가 있고, 창업자 본인 인터뷰·
내부 메모·전 직원 인터뷰까지 1인칭 출처가 복수 존재해 사고의 흐름을 채울 수 있었다.

## 답변 순서대로

1. **독자 문제 (reader_problem)**: `ONE_OFF_ONLY` — 한 번은 사게 만들었지만 재구매·재방문으로
   못 넘어간 사례. Homejoy(이미 적립, CONVERSION 병목)와 같은 어휘를 쓰지만 병목이 다르다 —
   Homejoy는 "할인 유입 고객이 정가로 전환 자체가 안 됨"(CONVERSION), Fab은 "일단 산 고객이
   다시 안 옴"(RETENTION)이라 서로 다른 무브다.

2. **transfer_note 한 줄씩**
   - 무브1(PRODUCT_FEATURE): 잘 팔리는 상위 20개 상품이 대형몰에서 더 싸게 팔리는지 오늘 검색해서
     세어 보라 — 그 비율이 손님이 "여기서만 살 이유"를 잃고 있다는 신호다.
   - 무브2(OPERATIONS): 이번 달 매출을 "신규"와 "광고 없이 스스로 돌아온 재구매"로 나눠 오늘
     세어 보라 — 재구매도 광고로 다시 데려온 것이면 그건 재구매가 아니다.

3. **preconditions**: 무브1은 상품 목록 + 경쟁몰 가격 검색 시간(낮음). 무브2는 구매 이력과
   유입 경로(광고 경유 여부)를 구분할 수 있는 최소 데이터(중간 — 이 구분을 실제로 계산했는지는
   Fab 사례에서도 확인 못 했다, 아래 "못 찾은 것" 참고).

3.5. **사고의 흐름 (1인칭 출처, 총 3건 확보 — 요구치 1건 초과)**
   - 창업자 Jason Goldberg, The Hustle 인터뷰: SKU 확장 관측(1,000→11,000+) → 아마존 가격
     비교 관측(80~90% 겹침) → "차별점이 사라졌다"는 추론.
   - 전 마케팅 담당자 Catherine Pao, LinkedIn 인터뷰(2016-03-31): "우리는 획득에만 집중했다"
     관측 → "브랜딩 광고는 안 먹히고 상품 광고만 먹혔다" 관측 → "브랜드 애착이 없어 재구매도
     매번 광고비를 또 냈다(doubly taxed)"는 추론.
   - 창업자 내부 메모(2013-10-11, alexanderjarvis.com 전재): "$200M을 썼는데 사업 모델도,
     고객이 뭘 사고 싶어 하는지도 증명 못 했다"는 자기 진단.

4. **무브 2건** — PRODUCT_FEATURE(큐레이션 포기), OPERATIONS(재구매 투자 부재). 병목은 둘 다
   RETENTION 하나로 건다(업종이 아니라 병목 기준).

5. **수치·출처**
   - 무브1: 판매 SKU 수 1,000 → 11,000+ (개). 출처: The Hustle 창업자 인터뷰(자기보고, primary).
   - 무브2: 매출 대비 마케팅비 35%(2013, 약 $40M). 출처: Catherine Pao 인터뷰(자기보고, primary).
   - 두 수치 모두 **자기보고 1차 출처 1건뿐**이라 사실확인 등급은 C다(독립된 원 관측 2건 조건
     미충족). `gradeMove()`(독자 인사이트 축)로는 두 무브 다 A — 구체적 행동+전제+뒷받침 근거가
     있기 때문이며, 이건 "발행 가능 등급"인 `fact_check_grade`(C)와 다른 축이다.

6. **outcome_status**: `shutdown`. 2015-03-03 PCH International에 자산 매각(TechCrunch 확인),
   창업자는 CEO에서 물러나며 완전히 손을 뗐다 — `active`로 임의 표기하지 않았다.

## 실패 사례 처리 원칙 준수

`outcome_direction`을 두 무브 모두 `negative`로 정직하게 적었다. 억지로 "그래도 이런 교훈이…"
식으로 positive 프레이밍을 만들지 않았다 — 두 무브 다 "이렇게 하면 재구매가 무너진다"는
반면교사 서술이고, transfer_note도 "하지 마라" 방향이 아니라 "지금 이 숫자를 확인해 보라"는
진단 행동으로 적었다(교훈 창작이 아니라 확인 행동을 옮긴 것).

## 못 찾은 것 (확인 불가로 남긴 항목)

- **The Hustle 기사 원문 게시일**: 같은 내용이 `thehustle.co/jason-goldberg-fab`,
  `.../how-one-of-the-worlds-fastest-growing-startups-burned-through-300m`,
  `.../sht-im-fcked-jason-goldberg-founder-fab` 세 URL에 반복 게재돼 있고, 검색으로는
  "2017년 원 게시, 이후 재게시"라는 정황만 나왔다 — 정확한 연-월-일을 특정하지 못해
  `published_at`을 비웠다(§7.1: 확인 불가를 양성으로 접지 않음). validate 경고 1건이 이 때문이다.
- **SKU 확장의 정확한 월별 시점**: 창업자 인터뷰는 "처음"과 "2013년"만 비교하고 중간 과정의
  날짜를 밝히지 않는다. `observed_period_start/end`를 비워 뒀다 — 임의로 "2013-12-31" 같은
  날짜를 만들지 않았다.
- **마케팅비 35%/$40M의 1차 산정 방식**: Pao 인터뷰에 그 수치가 인용은 되지만, 그 자신이
  직접 계산한 것인지 회사 재무 자료를 인용한 것인지까지는 원문에서 확인하지 못했다(`is_estimate`는
  false로 뒀으나 근거는 약할 수 있다 — 사람 검수 시 재확인 권장).
- **재구매율 자체의 수치**: "2/3의 구매가 재구매 고객에게서 나왔다"(2012년, Goldberg 발언 인용)는
  구간을 찾았지만 원문을 직접 열어 문맥을 확인하지 못해 초안에 넣지 않았다 — 넣었다면 무브1
  이전 시점의 "정상이었던 재구매"와 대비되는 근거가 됐을 것이나, 근거 없는 인용은 쓰지 않았다.
- **독립된 원 관측 2건 이상**: 두 무브 모두 자기보고 1차 출처 1건에 의존해 `fact_check_grade`가
  C다. 발행 게이트(CG-1)는 부정 서술에 등급 A를 요구하므로, 이 초안은 사내 참고용으로만
  쓸 수 있다 — 이것도 브리핑 문서에 이미 적힌 제약이다.

## 검증

```
node scripts/case-research.mjs validate --slug fab-com-curation-retention-collapse
```
→ **exit 0**. 무브 2건, 근거 4건, `gradeMove` 등급 A 2건(D 0건) / `fact_check_grade` C 2건(위 사유).
경고(warn) 5건은 모두 위 "못 찾은 것" 항목과 대응 — error는 0건.

## 보고 요약 (독자 축 우선)

- slug: `fab-com-curation-retention-collapse`
- 독자 문제: `ONE_OFF_ONLY` (한 번 사고 끝, 재구매로 못 넘어감)
- transfer_note: (1) 잘 팔리는 상품이 대형몰과 얼마나 겹치는지 오늘 세어 보기 (2) 이번 달 재구매가
  진짜 재구매인지 광고로 다시 데려온 것인지 오늘 나눠 보기
- 병목: RETENTION
- 무브 수: 2건 (PRODUCT_FEATURE, OPERATIONS) — 둘 다 outcome_direction=negative
- 등급: 독자 인사이트(gradeMove) A / A · 사실확인(fact_check_grade) C / C (자기보고 1차 출처
  1건뿐, 독립 원 관측 미충족 — 발행 불가, 사내 참고용)
- validate exit 코드: 0
- 못 찾은 것: The Hustle 기사 정확한 게시일, SKU 확장 월별 시점, 마케팅비 수치의 1차 산정
  방식, "2/3 재구매" 인용의 원문 확인, 무브별 독립 원 관측 2건째
