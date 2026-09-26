# 성과 원자료

## score-predictions
```
판정 로그 엔트리 13개 / 예측이 달린 엔트리 4개 / 예측 항목 7개
실측 스냅샷 9개 (post 4건)

LOG-20260906-01  → 보류 (score 0)
  like_rate up  실측 - / 기준 - / -×임계  → 보류  (h168 스냅샷 없음 — 확인 불가 (아직 그 시점이 안 됐거나 수집 실패))
  share_rate up  실측 - / 기준 - / -×임계  → 보류  (h168 스냅샷 없음 — 확인 불가 (아직 그 시점이 안 됐거나 수집 실패))

LOG-20260907-03  → 보류 (score 0)
  share_rate up  실측 - / 기준 - / -×임계  → 보류  (h168 스냅샷 없음 — 확인 불가 (아직 그 시점이 안 됐거나 수집 실패))
  like_rate up  실측 - / 기준 - / -×임계  → 보류  (h168 스냅샷 없음 — 확인 불가 (아직 그 시점이 안 됐거나 수집 실패))

채점 불가 2건 — 0건이 아니라 확인 불가다:
  LOG-20260907-01: 연결된 발행 글 없음
  LOG-20260907-02: 연결된 발행 글 없음

규칙별 신뢰도 (보류는 분모에서 뺀다)
  C-12: 유효 0 / 무효 0 / 보류 1  Wilson하한 -
  G-8: 유효 0 / 무효 0 / 보류 1  Wilson하한 -
  P-03: 유효 0 / 무효 0 / 보류 1  Wilson하한 -
  P-09: 유효 0 / 무효 0 / 보류 1  Wilson하한 -
```
exit 0

## coverage
```
# 병목별 승인 커버리지

  (매칭이 성립하려면 **서로 다른 케이스 2곳 이상**이 필요하다)

  ✅ AWARENESS       케이스 4곳 · 무브 6건 — Dr. Squatch, e.l.f. Beauty, GoPro, HOKA (Deckers Brands)
  ✅ TRUST           케이스 3곳 · 무브 7건 — Everlane, Ritual, Tuft & Needle
  ✅ CONVERSION      케이스 4곳 · 무브 7건 — ConvertKit, 종근당건강 락토핏, Notion, Slack
  ✅ RETENTION       케이스 3곳 · 무브 4건 — Hims & Hers, Native, Superhuman
  ✅ UNIT_ECONOMICS  케이스 2곳 · 무브 3건 — Plausible Analytics, Harry's
  ✅ DISTRIBUTION    케이스 3곳 · 무브 6건 — Figma, Testimonial.to, Zapier
  ✅ SUPPLY          케이스 3곳 · 무브 5건 — Fathom Analytics, Magic Spoon, Purple Innovation

매칭 가능 병목 7 / 7
```
exit 0


# 해설

## 결론 (3줄)
- 성과 채점은 아직 **유효 0 / 무효 0** — 판정 가능한 규칙이 하나도 없다. 전부 보류(4건, h168 스냅샷 미도달) 또는 채점 불가(2건, 발행 글 미연결)다. 지금 시점에 "이 훅이 먹힌다"고 말할 근거는 없다.
- 커버리지는 7/7 병목 전부 매칭 가능 상태(각 병목 최소 2케이스 충족). 다만 **UNIT_ECONOMICS 는 정확히 최소치(2케이스)** — 완충 없는 유일한 병목.
- 앵글 선택은 이번엔 성과 데이터가 아니라 **커버리지 두께**로만 정당화 가능하다.

## 채점 결과
- 판정 로그 엔트리 13개 중 예측이 달린 엔트리 4개 / 예측 항목 7개 (실측 스냅샷 9개, post 4건 기준).
- **유효 0 / 무효 0 / 보류 4건 (표본 부족)** — LOG-20260906-01(like_rate·share_rate), LOG-20260907-03(share_rate·like_rate). 사유: h168 스냅샷 없음 — "그 시점이 안 됐다"와 "수집 실패"를 원자료가 구분하지 못해 둘 다 확인 불가로 묶인다.
- **채점 불가 2건 (별도 사유, 보류와 혼합하지 않음)** — LOG-20260907-01, LOG-20260907-02: 연결된 발행 글 없음. 이건 "표본 부족"이 아니라 "채점 대상 자체가 없음"이라 보류와 다른 사건이다.
- 예측 항목 7개 중 규칙 신뢰도표에 실제로 잡힌 건 4개(C-12, G-8, P-03, P-09 — 각 보류 1). **남은 3개 항목이 어느 로그 엔트리(채점 불가 2건 쪽으로 추정)에 속하는지는 원자료에 개별 항목이 나열돼 있지 않다 — 확인 불가.**
- 규칙별 Wilson 하한: C-12/G-8/P-03/P-09 전부 `-` (분모 0, 계산 불가). 부트스트랩 구간이라 이 값들을 규칙 근거로 쓸 수 없다.

## 커버리지
- 매칭 가능 병목 **7/7** — 현재 갭 없음.
- AWARENESS: 케이스 4 · 무브 6 (Dr. Squatch, e.l.f. Beauty, GoPro, HOKA)
- TRUST: 케이스 3 · 무브 7 (Everlane, Ritual, Tuft & Needle)
- CONVERSION: 케이스 4 · 무브 7 (ConvertKit, 락토핏, Notion, Slack)
- RETENTION: 케이스 3 · 무브 4 (Hims & Hers, Native, Superhuman)
- UNIT_ECONOMICS: 케이스 2 · 무브 3 (Plausible Analytics, Harry's) — **최소치 정확히 충족, 완충 0**
- DISTRIBUTION: 케이스 3 · 무브 6 (Figma, Testimonial.to, Zapier)
- SUPPLY: 케이스 3 · 무브 5 (Fathom Analytics, Magic Spoon, Purple Innovation)

## 다음 앵글 후보 (최대 3, 병목 단위 — 무브 개별 제목은 원자료에 없음, 아래 "확인 못한 것" 참조)
1. **UNIT_ECONOMICS** (Plausible Analytics / Harry's 중 신규 3번째 케이스) — 왜 지금: 유일하게 케이스 2곳뿐인 병목. 한 곳이라도 반려·재채점으로 빠지면 매칭 성립 조건(2곳 이상)이 즉시 무너진다.
2. **RETENTION** (Hims & Hers / Native / Superhuman) — 왜 지금: 케이스 3곳은 확보했지만 무브 4건으로 전체 병목 중 두 번째로 얇다. 커버리지는 살아있지만 앵글 다양성이 가장 부족한 축.
3. **SUPPLY** (Fathom Analytics / Magic Spoon / Purple Innovation) — 왜 지금: 케이스 3곳·무브 5건으로 세 번째로 얇음. TRUST(7)·DISTRIBUTION(6)·CONVERSION(7)·AWARENESS(6)보다 우선순위가 앞선다.

## 확인 못 한 것
- 예측 항목 7개 중 3개가 정확히 어느 로그 엔트리·어느 규칙에 속하는지 — 규칙 신뢰도표와 채점 불가 2건 목록만으로는 매핑이 안 된다. 원자료에 항목별 상세가 빠져 있다.
- 병목별 "무브" 목록(케이스 이름만 있고 개별 무브 제목·날짜 없음) — 위 앵글 후보를 무브 단위로 더 좁히려면 `case-match.mjs --coverage` 의 상세 출력(현재는 집계치만 받음)이 필요하다.
- LOG-20260906-01 / LOG-20260907-03 의 h168 미도달이 "아직 시점이 안 됨"인지 "수집 실패"인지 — 원자료가 이 둘을 한 문구("확인 불가")로 합쳐서 구분 불가.
