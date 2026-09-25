# 에이전트 실행 상태

_갱신 2026-09-25 23:37 UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_

## 부서

- ✅ **cmo** `●●●●●●●●●●●` 11/11 · 23:17~23:37 · `cmo-2026-09-25-cron`
- ⛔ **cto** `●●●▲` 3/4 · 21:46~21:50 · `extract-auto-2026-09-26`
- ⛔ **cto** `●▲●` 2/3 · 16:42~22:06 · `relevance-judge-2026-09-26`
- ✅ **cto** `●` 1/1 · 00:00~23:00 · `cto-threads-match-2026-09-25`
- ❌ **cmo** `●●●●●●●●●✕●` 10/11 · 23:11~23:35 · `cmo-2026-09-24-cron`

## 막힘·실패·부분 실패

- ▲ `cto/extract-24deadfc-7d7e-41cd-807f-2ea63dbc4080` 막힘 — LLM 한도/예산 소진 — gemini(gemini-3.5-flash) 503: {
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}

- ▲ `cto/relevance-277fe82e-d930-4cc7-9d27-ccdb376784e4` 막힘 — LLM 요청 예산을 넘었습니다 (relevance-judge/claude-cli: 이번 요청 추정 $0.456 + 이번 $0.066 > 상한 $0.5, 호출 7회). LLM_REQUEST_BUDGET_USD 로 조정합니다.
- ✕ `cmo/digest` 실패 — push 실패 — remote: error: GH006: Protected branch update failed for refs/heads/main. remote: remote: - 2 of 2 required status checks are expected. To https://github.com/hanazi8282-maker/solutionarchive-app ! [remote rejected] main -> main (protected branch hook declined) error: failed to push some refs to 'https://github.com/hanazi8282-maker/solutionarchive-app'

_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._
_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._

