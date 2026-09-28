# 자동승인 신뢰도 최종(A안) · 기존 라벨 4필드 활용성 (2026-09-28)

## 1. 39건 사람 채점 → 운영 조합 정밀도

- 대상: 운영 조합(1차 Sonnet × 2차 Gemini 무료 API)이 **둘 다 관련**이라 한 SaaS 39건(`relevance-grading-rr39.md`). 남헌 채점, `relevance-grading-import.mjs` 로 반영(드라이런 확인 뒤 적용 39 · 실패 0, DB 재조회 relevant 25 · irrelevant 8 · unknown 6 일치).
- **정밀도 25/33 = 75.8%**(모름 6건 제외) · 3상태 그대로 25/39 = 64.1%.
- 킬스위치(`lib/analysis/auto-approval.ts` `tripThreshold`, p0 7%)에 대입: n=33 문턱 6 · 오류 8 → **켜는 즉시 꺼지는 수준.**
- 프로젝트별(관련/무관/모름): Lemon Squeezy 11/3/2 · ConvertKit 8/3/2 · Baremetrics 3/1/0 · Plausible 2/0/0 · Cal.com 1/1/2.
- 판단: SaaS 에서 이 조합의 완전 동의는 자동 승인 근거가 못 된다. `AUTO_APPROVAL_ENABLED` 는 계속 끈다. 이 39건은 human_verdict 로 들어가 다음 야간 판정부터 few-shot 이 된다(SaaS 사람 채점 0 → 39).

## 2. 라벨 4필드(impact · frequency · community_signal · wtp_mentioned)

### 채움률 — "관련" 최종 판정(`coalesce(human_verdict, verdict)`) 기준, 1차 모델별

- claude-cli(09-26 이후 현재 1차) 632건: impact 59% · frequency 25% · signal 68% · wtp 18%
- gemini-3-flash-preview 330건: 91 · 87 · 89 · 54 (라벨 불가 표시 17)
- gemini-3.5-flash-lite 210건: 97 · 95 · 90 · 66
- gemini-3.6-flash 85건: 84 · 76 · 65 · 47
- 무관·모름 행은 거의 비어 있다(설계대로).
- **현재 1차(Claude)가 라벨을 가장 적게 채운다.** 특히 frequency 25%·wtp 18% 는 정렬 기준으로 쓰기엔 빈칸이 대부분이다.

### 값이 "풍부함"을 가르나 — 아니다

- impact 별 원문 길이: high 평균 223자(중앙 120) · mid 232(112) · low 217(99) — **길이·구체성과 무관.**
- impact 는 "주제가 얼마나 아프게 들리나"에 가깝다: pain 비율 high 63% · mid 42% · low 29%.
- 표본(무작위):
  - `impact=high, frequency=mid` — "탈모가 꼭 완화되길요.. (반복)" → 내용 없는 바람.
  - `impact=high` — "가격이 좀 비싸지만 효과는 정말 있어서 좋아요" → 한 줄 소감.
  - `relevant, impact=low` — 샴푸 브랜드 키워드 나열(SEO 글) → 관련 판정 자체가 의심스럽다.
- **쓸 만한 것**: `community_signal`(pain/demand/objection)은 가장 많이 채워지고 범주로 의미가 있다 — 가중치가 아니라 **분류 축**으로 쓸 수 있다. `wtp_mentioned=true` 는 드물지만(5~7%) 강한 신호로 쓸 수 있다.
- **없는 것**: 구체성(수치·비교 대상·구체 상황)과 "같은 말을 몇 명이 하나"(빈도 집계). frequency 필드는 모델이 한 건을 보고 짐작한 값이지 실제로 센 값이 아니다.

## 결론 (3번 설계 입력)
- 기존 4필드는 **그대로 가중치로 쓰면 안 된다**(impact 가 풍부함과 무관, Claude 1차 채움률 낮음).
- 보완은 두 가지면 충분해 보인다 — ① 원문에서 결정적으로 뽑는 구체성 특징(숫자·금액·기간, 경쟁 제품명, 비교 표현, 길이 밴드) ② 짧은 항목을 버리지 않고 **비슷한 요청끼리 묶어 센 빈도**. 3번째 AI 판정은 필요 없을 가능성이 높다.
