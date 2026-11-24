# 에이전트 실행 상태

_갱신 2026-11-24 04:49 UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_

## 부서

- ❌ **cmo** `●●✕○●○○○●●●` 6/11 · 04:46~04:49 · `cmo-2026-11-23-cron`
- ⏳ **cto** `●` 1/1 · 04:34~진행중 ⚠️ stale(15분 미갱신) · `relevance-second-2026-11-24`
- ⛔ **cto** `●▲` 1/2 · 04:30~04:30 · `relevance-judge-2026-11-24`
- ⛔ **cto** `●●●●●●●●✕●●●●●✕` 13/15 · 04:06~04:25 · `extract-auto-2026-11-24-s1`
- ✅ **cto** `●` 1/1 · 00:00~04:00 · `cto-threads-match-2026-11-24`

## 막힘·실패·부분 실패

- ✕ `cmo/research` 실패 — 미정 (SaaS · 실패/피벗/철수 사례): exit 1 [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ▲ `cto/relevance-63f810a8-cce0-40b7-869f-08ea7010cdbe` 막힘 — claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your weekly limit · resets 12pm (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ✕ `cto/profile-63f810a8-cce0-40b7-869f-08ea7010cdbe` 실패 — 해석 가능한 주장이 0개
- ✕ `cto/profile-9ac6d268-3fd9-4aef-b3b0-a2fccd00d228` 실패 — 호출 실패: claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your weekly limit · resets 12pm (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}

_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._
_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._

