# 조사 노트 — Allbirds (allbirds-awareness-ceiling-collapse)

- slug: `allbirds-awareness-ceiling-collapse`
- 병목: AWARENESS (대상 미정 → WebSearch로 직접 선정. 회피 목록 21개와 겹치지 않음)
- 대상 선정 이유: 상장사라 SEC 공시(S-1/8-K)로 매출·마케팅비를 등급 A급으로 확인 가능하고,
  경영진이 실적발표에서 "우리는 기대한 수준까지 브랜드 인지도를 끌어올리지 못했다"고
  **AWARENESS 실패를 직접 자인**한 드문 사례. 2026-06-17 사명 변경(→ Smartbird, AI 인프라 전환)까지
  최종 결말이 확정돼 있어 outcome_status를 `unknown`으로 남기지 않아도 됐다.
- 무브 수: 2건 (등급 A 1 · C 1)

## 무브 1 — CHANNEL (긍정, 등급 C)

물리적 매장을 유료 디지털/TV 광고보다 효율적인 인지도 확산 채널로 검증한 사례.
보스턴 백베이 매장(2019-03 오픈) 기준 3개월, 해당 DMA에서 대조 시장 대비
웹 트래픽 +15% / 신규 고객 +83% / 순매출 +77%.

- 출처: S-1 (SEC EDGAR, 2021-08-31 최초 제출)
- 등급이 A가 아니라 C인 이유: 법정 공시 안에 있지만 **발행사가 자체 설계한
  마케팅 어트리뷰션 스터디**(감사 대상 재무제표 항목이 아님)라 `is_issuer_defined_metric=true`로
  적었다. 그러면 "법정 공시니까 A" 경로가 막히고, 자기보고 1차 단일 출처라
  다른 원 관측이 없어 C로 떨어진다. 이건 결함이 아니라 산식이 의도대로
  작동한 것 — Nubank ARPAC과 같은 함정(L-56)을 피한 결과다.
- 다른 독립 관측을 못 찾음: 이 매장 테스트를 인용한 제3자(애널리스트 리포트 등)는
  찾았지만 전부 S-1을 받아쓴 것이라 같은 관측 키로 접었다. **확인 불가**로 남긴다.

## 무브 2 — POSITIONING (부정, 등급 A)

상장 후 하이퍼그로스 압박으로 코어 포지셔닝(편안함·지속가능성)을 벗어나
고성능 러닝화(Tree Flyer, $160)·젊은 층 겨냥 패션 실루엣(Pacer)으로 확장 →
인지도 확대 실패 + 매출 14.7% 감소(FY2022 $297.8M → FY2023 $254.1M).

- 매출 수치 출처: SEC 8-K 첨부 실적발표(2024-03-12) — GAAP 매출 라인이라
  `is_issuer_defined_metric=false`, 법정 공시 경로로 등급 A.
- 원인 서사(왜 인지도가 안 늘었나) 출처: 2023-03-10 Q4 2022 실적발표에서
  공동CEO Joey Zwillinger의 직접 발언 — "we did not increase our brand
  awareness to the level that we anticipated". 3차 블로그(amynewman.com)가
  발언을 인용한 것이라 `supports_metric=false`로 두고, 매출 수치의 뒷받침으로는
  세지 않았다(경영진 자인 서사와 매출 수치는 별개 근거 축).
- CNBC 원문 실적발표 콜 트랜스크립트(1차)를 직접 찾으려 했으나 CNBC 기사
  URL은 403으로 막혀 접근 **확인 불가**. 대체로 amynewman.com 블로그(3차,
  인용 명시)를 썼다 — 등급 산정에는 지장 없음(매출 수치는 별도의 SEC 1차 출처로 A 확보).

## 못 찾은 것 (확인 불가로 남김)

- Q4 2022 실적발표 콜의 1차 트랜스크립트(Seeking Alpha 등) 원문 — CNBC 기사가
  403이라 대체 경로(블로그 인용)만 확인했다. 원문 트랜스크립트를 못 찾은 것이지
  발언 자체를 지어낸 게 아니다.
- 보스턴 백베이 매장 테스트를 뒷받침하는 독립(비자기보고) 원 관측 — 못 찾았다.
  이 무브는 등급 C로 정직하게 남긴다.
- 2026년 미국 신발 자산 매각 계약(American Exchange Group/WSG Brands)의
  정확한 거래 대금 — 뉴스 보도(CNBC 2026-06-17)에는 미기재. 공시(8-K) 원문에
  숫자가 있는지는 시간 관계상 대조하지 못했다 — **확인 불가**로 남긴다.
  (이 케이스의 무브·근거 등급에는 영향 없음 — outcome_status 판단에만 쓰임)

## validate 결과

```
node scripts/case-research.mjs validate --slug allbirds-awareness-ceiling-collapse
→ 무브 2건 · 근거 4건 · 등급 A1 B0 C1 D0
→ 검증 대상 1건 · error 0건
→ ✅ 전부 통과 (exit 0)
```
