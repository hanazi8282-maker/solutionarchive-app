# 조사 노트 — Meerkat (실패 사례 할당, AWARENESS)

- slug: `meerkat-twitter-api-awareness-collapse`
- 큐 사유: `failure_quota` — 실패/피벗/철수 사례, 성공으로 대체 금지
- 대상 선정: 미정 지시라 직접 선정. 기존 적립 목록(허용된 회피 목록)에 없음을 확인.
- outcome_status: `shutdown` (2016-10-04 앱 종료·Houseparty로 피벗) / outcome_direction: `negative` (양쪽 무브 모두)

## 선정 이유

Meerkat(2015 SXSW 라이브스트리밍 스타트업)은 "AWARENESS" 병목을 가장 깨끗하게
보여주는 사례다: 성장 엔진 자체가 트위터 소셜 그래프(팔로워 자동 알림)에
전적으로 의존하는 설계였고, 트위터가 그 API 접근을 2015-03-13 차단하자
(페리스코프 인수 완료 당일, 2시간 전 통보) 신규 유저의 자연 발견 경로가
구조적으로 붕괴했다. 단기적으로는 "차단당했다"는 논란 자체가 버즈를 만들었지만
(Amobee 소비지수 24.7→100, 확인은 했으나 무브에는 안 넣음 — 아래 "못 넣은 것" 참고),
5개월~1년 스팬에서는 인지 확산이 명백히 무너졌다.

## 무브 2건 (둘 다 등급 C, negative)

1. **CHANNEL** — 트위터 30일 언급량 206,000(2015-03) → 37,226(2015-08-17).
   VentureBeat 기사(비자기보고, secondary) 1건만 수치를 직접 뒷받침. BuzzFeed
   기사는 차단 "사실"만 확인하고 수치는 뒷받침 안 함(`supports_metric:false`).
   → 교차 확인 후보 2건 중 1건만 유효 → 독립 원 관측 1개 → 등급 C.
2. **CHANNEL** — iOS 소셜 카테고리 앱스토어 순위 21위(정점) → 368위(2016-03-04,
   Sensor Tower 데이터, Quartz 보도). TechCrunch(2015-04-16, App Annie 데이터)가
   같은 방향(추락)을 다른 시점·다른 벤더로 확인하지만 절대 수치가 다르므로
   (129위, 21→368과 별개 시점) `supports_metric:false`로 정직하게 표시 —
   추세는 뒷받침해도 이 무브의 정확한 수치는 뒷받침하지 않는다. → 등급 C.

**등급을 억지로 A로 올리지 않았다.** 두 무브 모두 독립 원 관측이 실질적으로
1개뿐이라 C에서 멈췄다. `validate` 경고에 "부정 사례인데 등급 C — 등급 A
아니면 발행 불가, 사내 참고용으로만 남는다"가 그대로 뜬다. 그게 정상이다.

## 확인한 것 / 확인 못 한 것

- **확인함**: 차단 날짜(2015-03-13, BuzzFeed가 트위터 대변인 코멘트로 확정),
  종료일(2016-10-04, TechCrunch), 창업자 자기보고 원문(Medium, 2016-03-04
  "distribution advantages of Twitter/Periscope and Facebook Live drew more
  early users to them away from us").
- **확인 불가**: L2 리서치펌의 원 보고서 원문(Appnova 블로그를 통해서만 봤다 —
  3차 출처라 무브 근거로 안 썼다. 원 보고서를 직접 찾지 못했다). Meerkat의
  정확한 시딩 펀딩 총액도 출처마다 $12M/$14M로 갈려서(Wikipedia vs
  productmint) 무브에 안 넣었다 — 확인 불가로 남긴다.
- **일부러 안 넣은 것**: Amobee 소비지수(24.7→100)는 확인했지만, 이건
  "차단 직후 단기 버즈 급증"이라 이 케이스의 핵심 주장(장기 인지 확산 붕괴)과
  방향이 반대다. 억지로 무브에 넣으면 오해를 부른다고 판단해 summary의
  배경 설명에만 남기고 무브로는 안 만들었다.
- **qz.com 직접 fetch 실패**(HTTP 403) — r.jina.ai 프록시로 우회해 원문 인용
  확보. 확인 불가를 그냥 넘기지 않고 대체 경로로 재확인했다.

## validate 결과

```
node scripts/case-research.mjs validate --slug meerkat-twitter-api-awareness-collapse
→ 무브 2건 · 근거 6건 · 등급 A0 B0 C2 D0
→ error 0건, exit 0
```
