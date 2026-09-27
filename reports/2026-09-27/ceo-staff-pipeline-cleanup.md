# CEO-STAFF — 데이터 파이프라인 정리 3건 + 승인 자동화 설계 (2026-09-27, 3차)

## TL;DR
1. 소스 정리·extract 재시도 코드는 PR #297, 마이그 000023 적용·양성 확인 완료. 백필 실행은 **Gemini 503 과부하로 0건 추출(blocked)** — 재시도 코드 머지 뒤 오늘 밤 야간 실행(상한 10)이 이어받는다.
2. T2 2차 판정은 282/819행만 왔고 1차와 일치율 49.8%, 사람 정답과 겹침 0 — 임계값을 지금 정할 근거가 없다. 설계안은 섀도 모드부터(`approval-automation-design.md`).
3. 지시 전제 정정 3건: todayhumor 는 09-25 이미 폐기(000019) · extract 갭은 "100건 규칙"이 아니라 실행 상한 3건 + failed 영구 제외 · "하루 10장"은 케이스 승인 줄이라 4레인 대상이 아니다.

## 1. 낭비 소스 정리
- danawa: 끄지 않고 축소 — 야간 active 타깃 1개 exhausted, daily_request_cap 200→30. 끄면 /analyze/new 소비재 URL 흐름이 조용히 깨진다(`lib/review/danawa-url.ts`). [직접 실행 확인] exhausted 17·active 0·cap 30.
- todayhumor: 소스는 09-25 000019 로 이미 폐기(dead). 남아 있던 active 타깃 3개만 failed 로 정리. [직접 실행 확인]

## 2. extract 백로그
- 실측: 대상 13건이 줄 서 있었다(SaaS 3·소비재 10). 원인은 실행당 상한 3건(실비용 $0.19/3건, 예산 $5 의 4%)과 failed 프로젝트 영구 제외. 4fcea3ff 는 200건이 아니라 **2,319건** 밀려 있다.
- 조치: 리포 변수 `EXTRACT_AUTO_MAX_PROJECTS=10`(설정 완료). PR #297 — failed 도 시도 3회 미만이면 자동 재시도, 재추출 실패 시 extracted 로 복원.
- [직접 실행 확인] 백필 2회 dispatch(run 36322068002·36322229608) 모두 첫 프로젝트에서 Gemini 503 → blocked, 추출 0건. 부작용: ConvertKit(8207483a) failed, d62f3caa extracted→failed(속성 5개는 보존). 둘 다 #297 재시도 규칙이 잡는다. 손으로 UPDATE 하지 않았다.

## 3. SaaS 소스 재점검
- Product Hunt 토큰: **미전달.** GitHub Secrets·.env.local 어디에도 없다. 남헌 재요청 필요(api.producthunt.com → API dashboard → Developer Token, 받으면 `scripts/voc-probe-producthunt.mjs` 실측만).
- Reddit: 여전히 막힘 — 자격증명 미발급 그대로(시크릿·env 0), 소스 disabled.
- 디스콰이엇: 자격증명 문제가 아니다. robots 200 그대로, 09-25 프로브 후 "후보 유지·편입 보류". 남은 단계는 21건 T2 정밀도 측정 + 이용약관 확인.

## 4. 승인 자동화 설계 — 설계만, 구현 대기
- 정본: `reports/2026-09-27/approval-automation-design.md`(Fable 작성, 오케스트레이터가 인용 코드·수치 검증).

## 남헌 결정
- Q1. 4레인 적용 범위 — A) 관련성 판정 줄만(케이스 승인은 §10.1 사람 유지) · B) 케이스 승인까지(§10.1 개정 필요). 권고 A.
- Q2. relevant 기준 — A) 1차 기준 유지(칭찬 포함) + community_signal 로 거름 · B) 2차 기준(불만·요구 있어야). 49.8% 불일치의 절반 가까이가 이 차이다. 권고 A, 결정 뒤 재측정.
- Q3. 보정 채점 — A) 카드 10장과 별도로 SaaS 관련성 10건/일 × 2주 · B) 카드 10장 안에서 나눔. 권고 A.
- Q4. 2차 판정자 — A) Gemini 다른 프롬프트 · B) Anthropic(Actions 시크릿 추가는 남헌 직접). 권고 B.
- Q5. Product Hunt 토큰 발급·전달.
- 설계 문서 §8 의 나머지(C 행 공개 여부·A 레인 영구 섀도 여부)는 문서 참조.

## 개선안
- 야간 extract 가 503 한 번에 전체 배치를 멈춘다(`isQuotaFailure` 가 503 을 쿼터로 봄). 과부하 중에 attempts 를 태우지 않으려는 의도라 유지했지만, 503 이 이틀 이상 이어지면 SaaS 백로그가 다시 쌓인다. 2일 연속 blocked 면 watchdog 경보를 거는 게 다음 30분짜리.
- 워크플로가 blocked 인데 초록으로 끝난다(§7.2 설계대로 `::warning::`). 오늘처럼 사람이 로그를 안 열면 "성공"으로 읽힌다 — 요약 줄에 blocked 를 띄우는 것 검토.
