# reports/ — 무인 루프 산출물의 정본

**MD 파일이 정본이다.** Notion 미러는 없다(2단계로 미뤘다). 여기 없는 것은
없는 것이고, 여기 적힌 것이 그날 실제로 일어난 일이다.

단, **진행 상태의 정본은 DB**(`agent_runs` / `agent_run_steps`)다. 이 디렉터리의
`status/DASHBOARD.md` 는 그걸 렌더한 결과이지 원본이 아니다. 커밋 전에 죽은
실행은 여기 안 남는다 — 그래서 상태는 DB 에 쓴다.

## 구조

```
reports/
  YYYY-MM-DD/
    DIGEST.md               ← 그날의 정본. 첫 줄 "붙여넣기 대기: N건" + TL;DR 3줄
    research/<slug>.md      ← 조사 노트 (무엇을 찾았고 무엇을 못 찾았는지)
    drafts/NN-<slug>.md     ← 초안 판정 사본 (원본은 drafts/threads/)
    decision-log-entries.md ← 방법론 아카이브에 옮길 판정 로그 후보
    performance.md          ← 성과 원자료 + 해설
    run.json                ← 실행 요약 (기계용)
  status/
    DASHBOARD.md            ← 부서별 최근 실행 상태 (status-render.mjs 가 생성)
  feedback/
    <날짜>-<주제>.md        ← CEO 피드백 수신함. 프론트매터 status: open|ingested
```

## feedback/ 규약

- 프론트매터 `status: open` 인 파일만 다음 실행이 읽는다.
- 인제스트해도 **파일을 지우지 않는다.** `status` 만 `ingested` 로 바꾼다.
  지우면 "무엇을 요청했었나"의 기록이 사라지고, 같은 요청이 반복될 때 이전에
  어떻게 처리했는지 되짚을 수 없다.
- `_` 로 시작하는 파일은 템플릿이라 읽지 않는다.

## 이 디렉터리에 없는 것

- 발행된 글. 발행은 사람이 Threads 앱에서 직접 한다 (CLAUDE.md §10).
- 승인 기록. 승인은 사람이 `case-review.mjs approve` 로 한다.
- 자격증명. 어떤 토큰도 여기 적지 않는다.
