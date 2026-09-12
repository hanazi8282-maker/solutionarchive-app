# 조사 노트 — Stanley Quencher (성공 사례 할당, AWARENESS)

- slug: `stanley-quencher-viral-awareness`
- 큐 사유: `coverage_gap` — AWARENESS 승인 케이스 2곳뿐이라 매칭 성립에 3곳째가 필요
- 대상 선정: 미정 지시라 직접 선정. 회피 목록(28건) 대조 완료, 중복 없음.
- outcome_status: `active` (2026-03 Fast Company 기사로 확인 — 브랜드 존속, 다만 카테고리 냉각 중) /
  outcome_direction: `positive` (3개 무브 전부)

## 선정 이유

Stanley(드링크웨어, PMI Worldwide 소유)는 2019년 "단종 검토" 상태였던 저인지도
SKU가, (1) 기존 타깃과 정반대인 마이크로인플루언서 오디언스로의 도매 파트너십,
(2) 신임 리더십의 리포지셔닝, (3) 2023년 UGC 바이럴에 대한 실시간 브랜드 반응
— 이 세 겹의 CHANNEL 밖 레버로 인지도 병목을 뚫은 사례다. "예산을 늘렸다"가
아니라 "누구에게, 어떤 형태로 보이게 했는가"를 바꾼 사례라 이식 가능성이 높다고
판단했다.

## 무브 3건

1. **PARTNERSHIP** (등급 C) — Buy Guide 도매 초도 물량. CNBC(2023-12-23,
   Buy Guide 공동창업자 LeSueur 자기보고 1차)만 5,000개 수치를 직접 뒷받침.
   Retail Dive(2023-11-14, Stanley SVP Navarro 자기보고 1차)는 같은 사건을
   10,000개(5,000+5,000 트랜치)로 서술해 총량이 어긋난다 — 둘 다 자기보고이고
   출처 간 숫자가 불일치해 `supports_metric:false`로 정직하게 갈랐다. 자기보고
   1차뿐, 비자기보고 교차 확인 없음 → C.
2. **POSITIONING** (등급 C) — 연매출 7,300만→7억5,000만 달러(2019→2023).
   CNBC(2023-12-23) 단일 기사가 유일한 관측원. Marketplace·Femfounded·Medium·
   Studio Sunup 등 다른 매체를 다 확인했으나 전부 이 CNBC 기사를 받아쓴 것으로
   드러나 같은 관측으로 접었다(도메인은 5곳이지만 원 관측은 1개). Retail Dive의
   "YoY 275%" 수치는 다른 지표라 이 무브의 수치를 뒷받침하지 않는다고 표시
   (`supports_metric:false`) — 억지로 교차 확인처럼 보이게 하지 않았다. → C.
3. **CONTENT** (등급 A) — '차량 화재 생존 Stanley 컵' TikTok 조회수.
   Fox Business(2023-11-18, "nearly 60 million")와 ABC7(2023-11-20,
   "60 million") — 서로 다른 매체가 서로 다른 날짜에 플랫폼 공개 조회수를
   각자 확인, 둘 다 비자기보고·비추정치. 서로 다른 원 관측 2개가 뒷받침 → A.
   (참고: 이후 기사들은 84M/81.6M 등 더 큰 숫자를 인용하지만 이건 시간 경과에
   따른 조회수 증가로 보이며, 초기 두 관측만 근거로 채택했다.)

**등급을 억지로 올리지 않았다.** 무브 0·1은 비상장사 자기보고 수치의 전형적
한계로 C에서 멈췄다 — 상장사가 아니라 SEC/DART 공시가 아예 없다. 무브 2만
플랫폼 공개 지표(조회수)라는 성격 덕에 독립 교차 확인이 가능해 A를 받았다.

## 확인한 것 / 확인 못 한 것

- **확인함**: Terence Reilly 2020년 Stanley 사장 합류(전 Crocs CMO, 2013-2020),
  2024년 Crocs/HeyDude로 복귀 — 이후 Stanley 사장/CEO는 Matt Navarro.
  Buy Guide 창업자 3인(Ashlee LeSueur 등, 2017년 창업), 팔로워 인구 구성
  (97.7% 여성, 24~45세)까지 확인.
- **확인 불가**: 도매 초도 물량의 정확한 총 개수(5,000 vs 10,000, 출처 불일치 —
  둘 다 무브 텍스트에 불일치 자체를 남겼다). TikTok 원본 영상의 정확한 게시
  시각·최종 누적 조회수(플랫폼에 직접 접근해 실시간 확인하지 못함 — WebFetch가
  TikTok 페이지의 동적 렌더링 수치를 가져오지 못했다. "확인 못 했다"를
  "0회"나 "84M"으로 접지 않고, 실제로 확인한 두 시점의 숫자만 근거로 남겼다).
  2023-11 스티치 응답 영상 자체의 조회수(기사마다 언급 안 하거나 "32M"이라고만
  하는데 그 출처를 다시 찾지 못해 무브에는 원본 영상 수치만 넣었다).
- **주의(혼동 방지)**: "Stanley Black & Decker"(SEC 상장, 전동공구 회사)는
  이 케이스의 Stanley(PMI Worldwide 소유 드링크웨어 브랜드)와 **다른 회사**다.
  검색 중 SEC 8-K가 섞여 나와 혼동 소지가 있었으나 필터링해 근거에서 제외했다.
  Stanley 드링크웨어는 비상장이라 SEC/DART 공시 자체가 없다.
- **일부러 안 넣은 것**: 2023-11 TikTok "화재 영상이 사실은 유료 협찬이었다"는
  일부 Medium발 미확인 의혹은, 추측성 논평일 뿐 확정된 사실이 아니라서 무브나
  근거에 넣지 않았다. summary에도 반영하지 않음(옮길 수 없는 소문).
  2025~2026 카테고리 냉각(DTC -20%, Circana 추정)은 이 케이스의 핵심 무브가
  아니라 outcome_status='active' 확인용 배경 근거(move: null)로만 남겼다 —
  "여전히 다 잘 되고 있다"처럼 과거형 성공을 현재형으로 왜곡하지 않기 위해서다.

## validate 결과

```
node scripts/case-research.mjs validate --slug stanley-quencher-viral-awareness
→ 무브 3건 · 근거 7건 · 등급 A1 B0 C2 D0
→ 이슈 없음(경고 0건), error 0건, exit 0
```
