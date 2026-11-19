# story flow 샘플 — 영역② 영업 도우미 — 써 보고 돈은 안 낸다

- 생성: 2026-11-19T14:54:02.146Z · 원천: 합성 픽스처 `fixtures/story-flow/cards.json` — 실제 회사·실제 인용 아님
- 진단: 장 6 · 상황 {"customer":"smb","price_band":"10-49","stage":"early_rev","team_size":"solo","pricing_model":"subscription"} · 원리 reduce_purchase_doubt_by_transparency

## 점수 적용 전 (pickFlowCards — 비슷함 상위 10 → 설득력) · ok
장 6 후보 5건 중 3건

| 자리 | 사례 | 원천 | 점수 | 비슷함/상황 | 설득력 | 안 된 시도 | 이유 2개 |
|---|---|---|---|---|---|---|---|
| 추천 | fx-sales-a | story_flow | - | 1 | 0.9 |  | 손님·값대·단계·팀 크기이 같다, 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다 |
| 대안 1 | fx-sales-d | story_flow | - | 0.395 | 0.9 |  | 다른 업종, 같은 원리: 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다 |
| 대안 2 | fx-sales-c | story_flow | - | 0.37 | 0.46 | 예 | 같은 장에서 비슷한 막힘을 겪었다 / 말로 확인된 결과(숫자는 없다), 안 된 시도도 함께 담겨 있다 |

## 점수 적용 후 (scoreCard 0.35/0.30/0.15/0.15/0.05 · 회사당 1장 · 폴백) · ok
장 6 · story flow 4 · 꼬리표 0 · 사례 은행 0 → 3건(story_flow)

| 자리 | 사례 | 원천 | 점수 | 비슷함/상황 | 설득력 | 안 된 시도 | 이유 2개 |
|---|---|---|---|---|---|---|---|
| 추천 | fx-sales-a | story_flow | 0.8522 | 1 | 0.9 |  | 손님·값대·단계·팀 크기가 같다, 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다 |
| 대안 1 | fx-sales-d | story_flow | 0.49 | 0.2 | 0.9 |  | 다른 업종, 같은 원리: 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다 |
| 대안 2 | fx-sales-c | story_flow | 0.3269 | 0.2 | 0.46 | 예 | 같은 장에서 비슷한 막힘을 겪었다 / 말로 확인된 결과(숫자는 없다), 안 된 시도도 함께 담겨 있다 |

## 결론서 ③ 비슷한 회사 칸(깃발 ON 일 때 화면에 나가는 것)
- **Fx Sales A** — 가격표 공개 → 전환 2배 (손님·값대·단계·팀 크기가 같다, 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다)
- **Fx Sales D** — 환불 보장 → 구매율 상승 (다른 업종, 같은 원리: 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다 / 숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 통하는 조건이 적혀 있다)
- **Fx Sales C** — 이 사례는 잘 안 풀린 경우입니다 — 가격 인상 → 해지가 늘었다 (같은 장에서 비슷한 막힘을 겪었다 / 말로 확인된 결과(숫자는 없다), 안 된 시도도 함께 담겨 있다)

## 인용 자체 대조(같은 카드 데이터, 독립 검증 아님 — 독립 대조는 story-flow-quote-check.mjs --db) — 3건 확인, 불일치 0건
