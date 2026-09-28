# T2 운영 조합 재시험 — 1차 Sonnet × 2차 Gemini 무료 API (2026-09-28)

> 남헌 지시 A(09-28): 실제 운영 조합으로 일치율을 재고, 나오기 전까지 `AUTO_APPROVAL_ENABLED` 는 끈다.
> 결과: **84.5% — 통과선 90% 미달. 플래그는 꺼진 채 둔다**(리포 변수 미설정, 확인함).

## 방법
- 표본: 09-28 재시험 2회차와 같은 SaaS 100건(`ops/state/t2-retest-2026-09-28/r2-sample.json`). 원문·목적·사업유형은 DB 원본.
- 1차: 운영 함수 `judgeRelevanceBatch` + 운영 프롬프트(`buildRelevancePrompt`, 통일 기준 `t2c-2026-09-28`), 모델 **Sonnet**(`claude-sonnet-5`).
  - 운영 `callClaudeCli` 는 자식 env 를 격리해 CI 의 OAuth 토큰을 전제하므로, 로컬에서는 **인증만 로컬 로그인**으로 바꾼 호출부를 넘겼다(`ops-combo.mjs` localCall). 프롬프트·모델·인자는 같다.
  - few-shot 없음(운영은 사람 채점을 넣지만 SaaS 사람 채점이 0건이라 운영에서도 비어 있다).
- 2차: Gemini **무료 API**(`GEMINI_API_KEY`), Actions 기본 체인(로컬 `GEMINI_MODEL` 덮어쓰기 제거). 실제 응답 모델: gemini-3.5-flash 4배치 · gemini-3.6-flash 1배치.
  - 지시문은 운영 2차와 같은 `SECOND_OPINION_INSTRUCTIONS`(통일 기준 포함). 결과 100행 `validateOpinions` 거부 0.
- 첫 시도에서 Gemini 503(수요 과다)이 났다 — 체인이 503 에선 다음 모델로 안 넘어가서, 스크립트가 모델을 하나씩 돌며 재시도한다.

## 결과
- **1차 × Gemini: 82/97 = 84.5%**(한쪽이라도 unknown 인 3건 제외) · 3상태 그대로 85/100 = 85%.
  - 둘 다 relevant 39 · 둘 다 irrelevant 43 · 반대 15(1차 relevant→Gemini irrelevant 9, 반대 6 — 한쪽 치우침 없음).
  - 프로젝트별: Cal.com 8/8 · Baremetrics 21/23 · ConvertKit 29/33 · Plausible 4/5 · **Lemon Squeezy 20/28(71%)** ← 약한 고리.
- 참고 비교(같은 100건):
  - Sonnet × Opus(09-28 재시험 2회차): 92.4%
  - Gemini × Opus 2차: 85/94 = 90.4%
  - import 드라이런(DB 의 **옛 기준** 1차 대비): 45/97 = 46.4% — 기준 통일 전 판정과의 비교라 운영 수치가 아니다.
- 1차 첫 실행에서 한 배치(Lemon Squeezy 20건)가 **유효하지 않은 JSON** 을 내 전부 unknown 이 됐다(코드펜스는 파서가 처리한다 — 파서 버그 아님). 운영에서도 같은 일이 나면 20건이 "모름"으로 남아 자동 승인 대상에서 빠진다(안전 방향). 그 20건만 재판정해 위 수치를 채웠다(`ops-first.run1.json` 이 첫 실행 원본).

## 판단
- 통과선 90% 미달 → §10.1 예외 조건 2 미충족. **자동 승인 플래그는 켜지 않는다.**
- 자동 승인이 실제로 쓰는 것은 "둘 다 relevant" 39건이다. 일치율 84.5% 는 그 39건이 맞다는 뜻도, 틀리다는 뜻도 아니다(SaaS 사람 정답 0건). 다음 확인은 그 39건의 **정밀도**다.

## 원자료
- `ops/state/t2-retest-2026-09-28/ops-combo.mjs`(재현 스크립트) · `ops-first.json` · `ops-first.run1.json` · `ops-second.json`
