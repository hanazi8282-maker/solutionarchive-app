---
description: CMO 데일리 루프 런북. 헤드리스(GitHub Actions)와 터미널이 같은 이 파일을 쓴다.
argument-hint: [--dry] (기본은 실제 실행)
---

`ops/roles/_principles.md` 와 `ops/roles/cmo.md` 를 Read 하고 그 역할로 행동한다.

인자: $ARGUMENTS

## 먼저 — 자동화가 있으면 그걸 쓴다

이 루프는 스크립트로 이미 구현돼 있다. 손으로 흉내 내지 말고 이걸 돌린다:

```
node --env-file=.env.local scripts/cmo-daily.mjs --trigger=local [--dry]
```

물량은 `CMO_RESEARCH_TARGET` / `CMO_DRAFT_TARGET` 로 조절한다(기본 2/2).
종료 코드: **0 전 단계 정상 / 1 실패한 단계 있음 / 2 사전 점검 실패(확인 불가)**.

아래 절차는 스크립트가 무엇을 하는지의 정본이자, 스크립트가 막혔을 때 사람이
같은 자리를 이어받기 위한 런북이다. 스크립트를 고치면 이 문서도 같이 고친다.

## 단계 (S0~S8) — 순차. 병렬 금지

- **S0 `preflight` 사전 점검** — Supabase 도달, `case_studies`/`case_moves` 존재,
  `agent_runs` 존재(없으면 JSONL 폴백), git 작업트리 청결, 브랜치 확인.
  여기서 확인 불가면 **뒤를 돌지 않는다.** 확인 못 한 채 진행하면 실패가
  "아무 일도 없었음"으로 보인다.
- **S1 `queue` 큐 선정** — `node scripts/research-queue.mjs --plan <N>`.
  커버리지 갭 + `reports/feedback/` open + 중복 slug 배제.
  **N 건 중 최소 1건은 `failure_quota`(실패·피벗·철수 사례)다.** 스크립트가 강제한다.
- **S2 `research` 조사 ×N** — 큐에서 집은 브랜드마다 `sa-cmo-researcher` 1회.
  산출: `drafts/cases/<slug>.json` + `case-research.mjs validate` exit 0
  + `reports/<날짜>/research/<slug>.md`.
- **S3 `commit_cases` 적립** — `node scripts/case-review.mjs commit --slug <slug>`.
  **전부 `review_status='draft'` 로 들어간다.** 자동 승인은 0건이다.
- **S4 `angle` 앵글 선정** — 승인된 무브 중 오늘 쓸 것을 고른다.
  등급·병목 커버리지·최근 발행 이력을 본다. 승인된 무브가 없으면 이 단계는
  `skipped` 이고, 그건 실패가 아니다 — 승인은 사람이 하기 때문이다.
- **S5 `draft` 초안 ×N + 게이트** — 무브마다 `sa-cmo-writer` 1회.
  content-gate Ⅰ~Ⅴ 를 실제로 실행한 기록이 초안 `.md` 에 있어야 한다.
- **S6 `stage` 스테이징** — `node scripts/case-draft-stage.mjs --input <json>`.
  exit 0 = `pending_review` / 3 = 마이그 미적용 폴백 / **4 = CG-1 이 막음**.
  4 는 실패가 아니라 `blocked` 다. blocker 에 "CG-1 귀속 문구 없음"이 들어간다.
  **새 `posts` 는 전부 `published_at IS NULL`.**
- **S7 `performance` 성과 분석** — `sa-cmo-analyst`. 읽기 전용.
  유효 / 무효 / **보류(표본 부족)** 를 분리해 센다.
- **S8 `digest` 다이제스트·상태·커밋** — `reports/<날짜>/DIGEST.md`,
  `reports/status/DASHBOARD.md`, 그리고 커밋.
  **커밋 전 스테이징 화이트리스트 검사**: `reports/`, `drafts/cases/`,
  `drafts/threads/`, `ops/state/` 4개 프리픽스 밖 파일이 하나라도 있으면
  **커밋하지 않고 실패한다.**

## 손으로 이어받을 때 지킬 것

- 발행하지 않는다. Threads API 를 호출하지 않는다.
- 승인하지 않는다. 등급을 손으로 바꾸지 않는다.
- 마이그레이션을 적용하지 않는다.
- `methodology/` 를 수정하지 않는다.
- 실패한 단계를 붙잡고 재시도하지 않는다. 다음 실행이 같은 일을 다시 한다.
  단, **같은 실패가 2일 연속이면 에스컬레이션한다.**

## 끝나면

`reports/<날짜>/DIGEST.md` 첫 3줄과 `붙여넣기 대기: N건` 을 그대로 보고한다.
막힌 스텝이 있으면 blocker 문구를 그대로 옮긴다 — 요약하지 않는다.
