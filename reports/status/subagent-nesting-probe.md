# 서브에이전트 중첩 호출 프리플라이트 (AC-0-a)

- **일시**: 2026-09-08 (조직 분리 1단계 · feat/agent-ops @ 3e67cd7)
- **질문**: 서브에이전트가 다른 서브에이전트를 호출할 수 있는가 → 가능하면 B안(부서장 = 에이전트 파일), 불가면 A안(부서장 = 슬래시 진입점).
- **판정**: **가능. B안 채택 확정.**

## 실측 방법

부모 세션(대화형 Claude Code)에서 경량 서브에이전트 1개를 spawn 하고, 그 서브에이전트에게
(1) 자신에게 주어진 도구 목록을 보고하고 (2) `Agent` 도구로 **다시** 중첩 서브에이전트를 하나
띄워 고정 문자열을 되돌려 받게 했다. 프로세스 깊이 = 부모 → 자식 → 손자.

## 결과

- 자식 서브에이전트의 도구 목록: `Agent, Artifact, Bash, Edit, Glob, Grep, PowerShell, Read, Skill, ToolSearch, Write`
- `HAS_AGENT_TOOL`: **yes** — 서브에이전트도 `Agent` 도구를 그대로 쥔다.
- 중첩 spawn 시도: 실행됨. 손자 서브에이전트가 기대한 `NESTED-SPAWN-OK` 를 반환.
- 실패·권한 프롬프트·오류 없음.

## 이 루프에서의 함의

- **대화형 경로** (`/cmo`·`/cto`·`/ceo-staff` → `Task`/`Agent` 로 `sa-*` 위임): 중첩이 필요하고,
  위 실측대로 **작동한다.** `.claude/agents/{cmo,cto,ceo-staff}.md` 의 `tools:` 에 `Task` 를 둔 B안 전제가 확인됐다.
- **자동 루프** (`scripts/cmo-daily.mjs`): 중첩을 **쓰지 않는다.** 오케스트레이터가 `runClaude()` 로
  `sa-cmo-researcher`/`sa-cmo-writer`/`sa-cmo-analyst` 를 직접 평면 spawn 한다(cmo-daily.mjs:276/335/400).
  2·3회차 로컬 실행에서 이 평면 spawn 이 실제로 산출물을 냈다(커밋 `6304985`, case `brandless-dtc-pricing-collapse`).
  즉 자동 루프는 AC-0-a 결과와 무관하게 동작하며, 중첩 가능성은 대화형 경로의 안전판이다.

## 근거 로그

capability 프로브 서브에이전트 최종 보고:

```
TOOLS: Agent, Artifact, Bash, Edit, Glob, Grep, PowerShell, Read, Skill, ToolSearch, Write
HAS_AGENT_TOOL: yes
NESTED_SPAWN_ATTEMPTED: yes
NESTED_SPAWN_RESULT: NESTED-SPAWN-OK
CONCLUSION: sub-agents can spawn further sub-agents in this environment.
```
