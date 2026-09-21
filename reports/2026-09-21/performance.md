# 성과 원자료

## score-predictions
```
판정 로그 엔트리 13개 / 예측이 달린 엔트리 4개 / 예측 항목 7개
실측 스냅샷 7개 (post 4건)

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

  ✅ AWARENESS       케이스 3곳 · 무브 4건 — Dr. Squatch, e.l.f. Beauty, GoPro
  ✅ TRUST           케이스 3곳 · 무브 7건 — Everlane, Ritual, Tuft & Needle
  △ CONVERSION      케이스 1곳 · 무브 1건 — ConvertKit
  ❌ RETENTION       케이스 0곳 · 무브 0건
  ❌ UNIT_ECONOMICS  케이스 0곳 · 무브 0건
  △ DISTRIBUTION    케이스 1곳 · 무브 2건 — Zapier
  △ SUPPLY          케이스 1곳 · 무브 2건 — Purple Innovation

매칭 가능 병목 2 / 7
```
exit 0


# 해설

# 성과 해설 (2026-09-21) — sa-cmo-analyst

**결론부터**: 이번 판정 로그로는 어떤 규칙도 유효/무효를 아직 말할 수 없다 — 전부 보류다. 커버리지는 7개 병목 중 2개(AWARENESS, TRUST)만 매칭 성립 상태라 다음 앵글은 이 둘에서만 근거 있게 고를 수 있다.

## 채점 결과 — 유효 / 무효 / 보류

- 유효 0 / 무효 0 / **보류 4** (표본 부족: h168 스냅샷 미도달 또는 수집 실패) — LOG-20260906-01(like_rate·share_rate), LOG-20260907-03(share_rate·like_rate)
- **채점 불가 2건** (0건도 보류도 아닌 별개 사유: 연결된 발행 글 없음) — LOG-20260907-01, LOG-20260907-02
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 — 네 규칙 전부 유효0·무효0·보류1, Wilson 하한 산출 불가
- 판정 로그 13개 중 예측 달린 엔트리는 4개(예측 항목 7개)뿐 — 나머지 9개는 예측 자체가 없어 채점 대상이 아니다(이 원자료엔 사유 없음, 확인 못 함)

→ **규칙 근거로 쓸 수 있는 실측이 아직 하나도 없다.** "이 훅이 먹힌다"는 결론은 이번 사이클에서 낼 수 없다(_principles.md §부트스트랩 금지).

## 커버리지 갭 — 매칭 가능 병목 2/7

- ✅ AWARENESS — 케이스 3곳(Dr. Squatch, e.l.f. Beauty, GoPro), 무브 4건 — 매칭 성립
- ✅ TRUST — 케이스 3곳(Everlane, Ritual, Tuft & Needle), 무브 7건 — 매칭 성립
- △ CONVERSION — 케이스 1곳(ConvertKit), 무브 1건 — **갭, 2번째 케이스 필요**
- △ DISTRIBUTION — 케이스 1곳(Zapier), 무브 2건 — **갭, 2번째 케이스 필요**
- △ SUPPLY — 케이스 1곳(Purple Innovation), 무브 2건 — **갭, 2번째 케이스 필요**
- ❌ RETENTION — 케이스 0곳, 무브 0건 — **갭, 1번째 케이스부터 필요**
- ❌ UNIT_ECONOMICS — 케이스 0곳, 무브 0건 — **갭, 1번째 케이스부터 필요**

## 다음 앵글 후보 (무브 단위, 최대 3개)

원자료에 개별 무브 제목이 없어(브랜드·건수만 제공됨) 병목 단위로만 근거를 댄다 — **개별 무브 선택은 확인 불가**, cmo가 case_moves 상세를 별도로 봐야 함.

1. **TRUST 계열 (Everlane / Ritual / Tuft & Needle, 무브 7건)** — 왜 지금: 매칭 성립된 두 병목 중 무브 표본이 가장 크다(7건). 규칙 신뢰도가 전부 보류인 지금, 표본이 큰 쪽에서 뽑아야 다음 채점 주기에 데이터가 쌓인다.
2. **AWARENESS 계열 (Dr. Squatch / e.l.f. Beauty / GoPro, 무브 4건)** — 왜 지금: 드래프트 폴더에 이미 Dr. Squatch 신규 케이스(`drafts/threads/2026-09-21-dr-squatch-humor-video-natural-soap.*`)가 대기 중 — 같은 병목·같은 브랜드로 파이프라인이 이미 움직이고 있어 중복 조사 없이 이어갈 수 있다.
3. **SUPPLY (Purple Innovation, 무브 2건)** — 왜 지금: 드래프트 폴더에 SUPPLY 성격 신규 케이스 2건(`magic-spoon-cereal-supply-reorder-discipline.json`, `zume-pizza-mobile-oven-production-collapse.json`)이 이미 조사 대기 중 — 승인되면 SUPPLY가 케이스 2곳으로 올라가 △→✅ 전환된다. 단, **지금 당장은 매칭 불성립(케이스 1곳)이라 교차 근거 앵글로는 아직 못 쓴다** — 위 두 초안 승인 이후가 조건이다.

## 확인 못 한 것

- 예측 항목 7개 중 상세가 드러난 것은 4개(2개 로그)뿐 — 나머지 3개 항목의 규칙·판정은 원자료에 없어 확인 불가.
- 판정 로그 13개 중 예측 없는 9개의 사유(예측 미설정인지 별도 채점 경로인지) — 원자료에 없어 확인 불가.
- 개별 무브(케이스 내 세부 실행) 제목·내용 — `case-match.mjs --coverage` 출력에 케이스명·건수만 있고 무브 단위 상세는 없어 확인 불가.
- `drafts/cases/`에 걸린 두 신규 SUPPLY 초안의 검증(gate) 통과 여부 — 이번 원자료 범위 밖이라 확인 불가.
