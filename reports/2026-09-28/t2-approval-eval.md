# rr-v2 자동 승인 평가 (2026-09-28, 기준 t2d-2026-09-28)

- 대상 110행 · 예시 제외 9 · 판정 빠짐(unjudged) 0 · 원문 폐기 제외 0 · 사람 정보 열 있음
- gold 확정 37행(그중 승인해도 되는 행 29)
- **A(둘 다 관련 ∧ 둘 다 정보 있음) 30건 · 오류 2건 · 정밀도 93.3% · 재현율 96.6%** — **잠정**: A 중 26건은 사람 정보 열이 비어 '관련=정보 있음'으로 추정한 정답
- 가동 문턱(문서화만, 플래그는 사람이 켠다): n_A≥40 · 오류≤2 · 재현율≥50% → 미충족
- 옛 프롬프트 대비 1차 verdict 일치: 84/100 (84%) · 기준선 ops/state/t2-retest-2026-09-28/ops-first.json

## 재확인 목록 0건 (정보 열 미기재 ∧ 예측과 부딪침: a = 사람 무관·모름인데 예측 승인 · c = 사람 관련인데 예측 미승인 · b = 09-28 좁은 기준 무관, 항상 — 관련 열도 다시)

표 만들기: `node --env-file=.env.local scripts/relevance-grading-sample.mjs --recheck ops\state\t2-eval\t2d-2026-09-28-eval.json`

## 1차 verdict 가 바뀐 행 (최대 30)
- `44e5822d-778a-4050-82c0-4dc0cb7af664` · relevant → irrelevant
- `6374499d-14f5-4793-a648-9bad2276faac` · relevant → irrelevant
- `f3e83783-577b-4e38-b0ae-591fa2ee0e90` · relevant → unknown
- `046af2a4-227b-4010-94f5-70d437b730a1` · irrelevant → relevant
- `10c3aa0c-685c-43a3-b9f5-13ca96601a3e` · relevant → irrelevant
- `1521c65f-f1c3-4ff7-930e-3a2436695b1b` · relevant → unknown
- `3da1395f-61e3-4ca8-b0ea-1231ac31d389` · relevant → irrelevant
- `4792891d-c82e-4541-9b44-3c3d28056cc3` · irrelevant → relevant
- `4c9ac207-77b3-4035-87dc-efe2f4cad9b7` · irrelevant → relevant
- `52c2c101-2601-402a-833a-36a683ee8e24` · relevant → irrelevant
- `561e3a11-e07c-4f6f-90ac-60166676c993` · irrelevant → relevant
- `5f4e7725-7544-446d-9efd-f5119fb5fe82` · irrelevant → relevant
- `6e82a440-b502-4cc3-81ea-f16cd56b9c02` · irrelevant → relevant
- `9cce5b0f-938b-4042-8592-eb918c6aa31c` · unknown → relevant
- `b4cd9ff3-2f9f-41e9-9b31-8eeedf811432` · irrelevant → relevant
- `dad559b2-1a23-40e9-b7db-1f98f75abe47` · irrelevant → relevant
