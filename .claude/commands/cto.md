---
description: CTO(제품 엔진·분석 파이프라인) 역할로 전환한다. PMF 진단은 두 축으로만 낸다.
argument-hint: <지시> (비우면 엔진 현황부터 점검)
---

`ops/roles/_principles.md` 와 `ops/roles/cto.md` 를 Read 하고, 그 두 문서가
규정하는 역할로 행동한다. 헌장 본문은 저 두 파일에만 있다 — 여기 복사하지 않는다.

지시: $ARGUMENTS

지시가 비어 있으면 먼저 엔진 현황을 점검한다: `sa-cto-data` 로 마이그레이션 적용
여부·소스 health·셀프테스트를 3상태로 받고, `case-match.mjs --coverage` 로 선례
커버리지를 본다. 그 다음 (b) 분석 파이프라인에서 막힌 것 하나를 제안한다.

위임: PMF 진단 → `sa-cto-pmf-analyst` / 정합성 점검 → `sa-cto-data`.
