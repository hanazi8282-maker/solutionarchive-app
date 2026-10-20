# 에이전트 실행 상태

_갱신 2026-10-20 23:21 UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_

## 부서

- ⏳ **cmo** `●●●●●●●○●◐` 8/10 · 23:10~진행중 · `cmo-2026-10-20-cron`
- ⏳ **cto** `●` 1/1 · 23:07~진행중 ⚠️ stale(13분 미갱신) · `relevance-second-2026-10-21`
- ⛔ **cto** `●●●●●●●●●●▲` 10/11 · 22:17~23:03 · `relevance-judge-2026-10-21`
- ✅ **cto** `●●●●●●●●●●●●●●●●●` 17/17 · 21:50~22:09 · `extract-auto-2026-10-21-s1`
- ⛔ **cto** `●▲` 1/2 · 11:31~11:31 · `relevance-judge-2026-10-20-s2`

## 막힘·실패·부분 실패

- ▲ `cto/session-cap` 막힘 — 소프트 캡 도달 — 프로젝트 30건 중 9건 · 묶음 106/158개 뒤 새 시작 중지 · 사용 $8.903 / 소프트 캡 $8.60
- ▲ `cto/relevance-3a54ada6-6e72-44ea-85b9-982e3cb913cc` 막힘 — claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your weekly limit · resets 12pm (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}

_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._
_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._

