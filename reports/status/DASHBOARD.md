# 에이전트 실행 상태

_갱신 2026-11-19 02:01 UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_

## 부서

- ✅ **cmo** `●●●●●○○○●●●` 8/11 · 01:52~02:01 · `cmo-2026-11-18-cron`
- ⏳ **cto** `●` 1/1 · 01:21~진행중 ⚠️ stale(40분 미갱신) · `relevance-second-2026-11-19`
- ⛔ **cto** `●▲` 1/2 · 01:12~01:12 · `relevance-judge-2026-11-19`
- ⛔ **cto** `●▲` 1/2 · 00:44~00:44 · `extract-auto-2026-11-19-s1`
- ✅ **cto** `●` 1/1 · 00:00~02:00 · `cto-threads-match-2026-11-19`

## 막힘·실패·부분 실패

- ▲ `cto/relevance-63f810a8-cce0-40b7-869f-08ea7010cdbe` 막힘 — claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your session limit · resets 1:30am (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ▲ `cto/extract-e9d72765-049a-467f-8614-8e8226559ef6` 막힘 — LLM 한도/예산 소진 — claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your session limit · resets 1:30am (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}

_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._
_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._

