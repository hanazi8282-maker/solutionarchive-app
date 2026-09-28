# rr-v2 자동 승인 평가 (2026-09-28, 기준 t2d-2026-09-28)

- 대상 110행 · 예시 제외 9 · 판정 빠짐(unjudged) 0 · 원문 폐기 제외 0 · 사람 정보 열 있음
- gold 확정 33행(그중 승인해도 되는 행 28)
- **A(둘 다 관련 ∧ 둘 다 정보 있음) 26건 · 오류 0건 · 정밀도 100% · 재현율 92.9%** — **잠정**: A 중 26건은 사람 정보 열이 비어 '관련=정보 있음'으로 추정한 정답
- 가동 문턱(문서화만, 플래그는 사람이 켠다): n_A≥40 · 오류≤2 · 재현율≥50% → 미충족
- 옛 프롬프트 대비 1차 verdict 일치: 84/100 (84%) · 기준선 ops/state/t2-retest-2026-09-28/ops-first.json

## 재확인 목록 13건 (정보 열 미기재 ∧ 예측과 부딪침: a = 사람 무관·모름인데 예측 승인 · c = 사람 관련인데 예측 미승인 · b = 09-28 좁은 기준 무관, 항상 — 관련 열도 다시)
- `08f10ada-daa6-495c-8c6b-1aad17963bb3` · a
- `0dd76440-47c8-466c-a087-29aa9e9cda34` · a
- `2161a370-3793-4408-ac9d-71a310ef7631` · b
- `44e5822d-778a-4050-82c0-4dc0cb7af664` · b
- `6374499d-14f5-4793-a648-9bad2276faac` · b
- `7f93e98c-3701-4884-8a26-e934a16ffae6` · b
- `9256a8c8-91e8-4f12-9a2d-032980d681d2` · b
- `9ff5b220-4606-4437-a006-a00509bbab4b` · a
- `dd4f20d8-df21-4dc0-a905-b07df4c8227c` · b
- `f3e83783-577b-4e38-b0ae-591fa2ee0e90` · b
- `f4e5bae6-b495-4061-91a4-43135d5c1ff4` · c
- `f6901f91-c846-4454-93af-7d2574e23f72` · b
- `ffcb0e2d-1e62-4a40-baa4-b44e1de0fca7` · c

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
