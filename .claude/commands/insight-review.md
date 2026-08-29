---
description: 나이틀리 인사이트 루프를 수동 실행하고 결과를 읽어 보고한다. 기본은 dry-run(판정만).
argument-hint: [--apply] [--host <url>]
---

인사이트 피드백 루프를 수동으로 돌린다. 대상: $ARGUMENTS

야간 크론이 실패했거나 아직 안정화 전일 때의 **백업 경로**이자, 아침에
"어젯밤 뭐가 바뀌었나"를 확인하는 경로다.

⚠️ 기본은 **dry-run** 이다. 판정만 하고 DB 쓰기·가이드 커밋을 하지 않는다.
   `--apply` 가 인자에 있을 때만 실제로 반영한다. 이 순서를 뒤집지 마라 —
   이 루프는 사람 승인 없이 main 에 커밋하는 유일한 경로다.

## 1. 실행

호스트는 `--host` 로 받고, 없으면 프로덕션(`https://solutionarchive-app-hanazi-s-projects.vercel.app`)을 쓴다.
`--apply` 가 없으면 `?dry=1` 을 붙인다.

```bash
# dry-run (기본)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "<host>/api/cron/nightly-insight-loop?trigger=manual&dry=1" | tee /tmp/insight-run.json

# 실제 반영 (--apply 일 때만)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "<host>/api/cron/nightly-insight-loop?trigger=manual" | tee /tmp/insight-run.json
```

`CRON_SECRET` 은 `.env.local` 에서 읽는다. 값을 화면에 출력하지 마라.

## 2. 응답 해석

응답의 `steps[]` 는 7단계다. 각 단계의 `ok` 와 `detail` 을 그대로 읽는다.

- `ingest` — Notion 동기화. `skipped: true` 면 환경변수 미설정이라 정상이다
  (정본 캡처 경로는 `/api/insight/capture`). `missingProps` 가 비어 있지 않으면
  **Notion 속성 이름이 어긋난 것**이다 — `availableProps` 와 비교해 알려라.
- `analyze` — LLM 분석. `provider` 가 무엇인지 확인한다. `failed > 0` 이면
  `failures[]` 를 그대로 보고한다. 실패한 행은 `failed` 로 고정돼 재시도되지
  않는다(사용량 보호). 원문이 비었던 게 대부분의 원인이다.
- `patternize` — 신규/보강 패턴. `newHypotheses` 가 있으면 실험이 시작된 것이다.
- `measure` — 승격/기각 판정. `decisions[]` 가 핵심이다. 각 항목의
  `sampleSize` / `improvement` / `reason` 을 표가 아니라 항목당 한 줄로 보고한다.
- `reflect` — 가이드 렌더링·커밋. dry-run 이면 `preview` 가 들어 있다.
  실제 실행이면 `changed: false` 가 정상일 수 있다(바뀐 게 없으면 커밋 안 함).

## 3. 보고

다음을 항목당 한 줄로 정리한다. 넓은 표를 쓰지 마라.

- 분석 건수 / 신규 패턴 / 승격 / 기각 (`counts`)
- 승격된 패턴이 있으면: 무엇이, 표본 몇 개로, 개선폭 얼마로 올라갔는지
- 기각된 패턴이 있으면: 무엇이 왜 회수됐는지
- 커밋이 생겼으면 `commitSha`
- 실패한 단계가 있으면 그 단계와 에러 원문

dry-run 이었으면 마지막에 반드시 덧붙인다:
**"판정만 했다. 실제 반영은 `/insight-review --apply`."**

## 4. 확인할 것

`ok: false` 인 단계가 있으면 원인을 진단하되 **고치지는 마라.** 이 루프는
매일 밤 다시 돈다. 한 번의 실패는 다음 실행에서 자동으로 재시도된다
(`analyze` 의 failed 행만 예외 — 그건 의도적으로 고정된다).

수정이 필요하다고 판단되면 무엇을 왜 고쳐야 하는지 보고하고 사용자 승인을 받는다.
