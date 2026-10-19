# 에이전트 실행 상태

_갱신 2026-10-19 23:39 UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_

## 부서

- ❌ **cmo** `●●✕○●●✕○●●●` 7/11 · 23:37~23:38 · `cmo-2026-10-19-cron`
- ✅ **cto** `●` 1/1 · 23:08~23:09 · `relevance-auto-approve-2026-10-20`
- ✅ **cto** `●●` 2/2 · 23:04~23:08 · `relevance-second-2026-10-20`
- ⛔ **cto** `●●▲` 2/3 · 22:54~23:01 · `relevance-judge-2026-10-20`
- ✅ **cto** `●●●●●●●●●●✕●●●●●●` 16/17 · 22:36~22:57 · `extract-auto-2026-10-20-s1`

## 막힘·실패·부분 실패

- ✕ `cmo/research` 실패 — 미정 (SaaS · 실패/피벗/철수 사례): exit 1 [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ✕ `cmo/draft` 실패 — bannerbear-price-floor-unit-economics/PRICING: exit 1
- ▲ `cto/relevance-c21b67b9-ed3a-43d7-a1b9-4599e41edb2b` 막힘 — claude -p 실패 (exit 1): subtype=success stop_reason=stop_sequence num_turns=1 api_error_status=429 result=You've hit your weekly limit · resets 12pm (UTC) [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ✕ `cto/profile-3a353541-fde0-42d1-88f2-e2c9e683bef2` 실패 — 해석 가능한 주장이 0개

_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._
_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._

