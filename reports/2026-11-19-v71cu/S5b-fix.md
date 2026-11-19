# S5b-fix — PR #679 빌드 실패 원인과 조치 (2026-11-19)

## 1) 실패 지점
- 실패 단계: `node scripts/review-fingerprint-selftest.mjs` — `FAIL 감사표: 어댑터 파일과 표의 집합이 같다` (dcinside.ts, ruliweb.ts 가 AUDIT 표에 없음).
- "muted 2.2 / 기준 4.5" 는 실패가 아니다. `design-contrast-selftest.mjs --mutate` 가 일부러 muted 를 faint 로 바꿔 미달을 잡는지 보는 변이 테스트 출력이고, 그 단계는 "확인 OK" 로 통과했다. 일반 실행은 `PASS — 72개 조합 전부 문턱 이상`(muted on canvas 5.53).
- main 최신 Build Check 5건 전부 success. 디자인 토큰은 건드릴 필요가 없었다.

## 2) 조치
- 원인은 #679 자신이다(어댑터 2개를 추가하고 감사표 한 줄씩을 안 더함). 별도 PR 없음. #679 브랜치(feat/v71cu-s5b)의 `scripts/review-fingerprint-selftest.mjs` AUDIT 에 `'dcinside.ts': false, 'ruliweb.ts': false` 추가(externalId = 정규화된 글 경로 -> 전역 유일, clien 과 같은 구성).
- 로컬 selftest exit 0.

## 3) 약관상 금지 포럼 안전장치 확인(읽기만)
- quote_policy: 마이그 000016 의 두 소스 행 모두 `'none'`, override `owner_2026-11-19`.
- 요청 한도: min_interval_ms 8000, daily_request_cap 40 (둘 다), 시작 상한 50%.
- 중단: 두 어댑터 `abortOnChallenge: true` + `isChallenge`(Just a moment·cf-chl·빈 본문). runner.ts 는 403/429/캡차/빈 응답을 "차단 응답 — 실행을 중단한다"로 break 하고 "우회하지 않는다"를 명시. 403/429 는 quotaMarkers 가 없어 차단으로 센다.
- robots: 디시는 Disallow 갤러리를 표에서 제외, 루리웹은 쿼리 없는 주소만 호출. 소유자 예외 경로도 strict 모드.
- 우회 로직(UA 위장·프록시·스텔스·로그인): 없음.
- 참고: 루리웹은 robots_status 'disallowed' 인 채 소유자 예외로 켠다(쿼리 금지 규칙 때문). 문서화돼 있고 남헌 결정 사항.
