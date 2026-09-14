# ConvertKit — 컨시어지 마이그레이션 (CONVERSION)

- slug: `convertkit-concierge-migration-conversion`
- 독자 문제(reader_problem): `MAKE_BUT_NO_MONEY` — 어휘 7개 중 "전환 작업이 번거롭다"는 이유로 데모까지 가고도 계약이 안 붙는 상황에 정확히 맞는 코드가 없다. 기본값으로 처리했다. `config/reader-problems.json` 에 "데모까지 갔는데 계약이 안 붙는다" 류 코드가 추가되면 재분류 대상.
- 각 무브의 transfer_note 한 줄:
  - 무브1(OFFER): "잠재고객이 '전환 작업이 번거롭다'고 거절하면, 그 작업을 그 자리에서 무료로 대신 해주겠다고 제안하라."
  - 무브2(OPERATIONS): "경쟁 제품 쓰는 잠재고객 10명에게 '뭐가 불편한가'만 묻는 개인화 콜드 이메일을 보내고 답장 오면 30분 데모를 제안하라."
- 병목: CONVERSION (큐 사유 coverage_gap 대응 — 기존 승인 2곳에 3번째로 추가)
- 무브 수: 2
- 등급:
  - 무브1 OFFER = **C** (자기보고 1차 1건뿐, 다른 원 관측 없음). 근거: 나단 배리 자사 블로그(`nathanbarry.com/sales`, 2017-07-06 발행)의 "마이그레이션 고객 이탈률 1.5% vs 일반 5.5%" 수치. 3차 해설(failory 뉴스레터)은 같은 원 글을 받아쓴 것이라 같은 observation_key 로 묶고 교차 확인으로 세지 않았다.
  - 무브2 OPERATIONS = **D** (서술만, 수치 없음). 콜드 이메일 + 30분 데모 세일즈 동선 자체는 같은 글에 구체적으로 나오지만, 그 글 스스로 직접세일즈를 "워드오브마우스 등 다른 채널의 동력"으로 프레이밍하고 있어(본문 확인) 이 무브만 떼어낸 순효과 수치를 만들 근거가 없었다. 억지로 $1,300→$725,000 MRR 전체 성장분을 이 무브에 붙이면 다른 채널(제휴 프로그램, Pat Flynn 추천, 웨비나) 기여를 이 무브 하나의 성과로 둔갑시키는 것이라 붙이지 않았다.
- validate exit 코드: **0** (`error 0건`, `✅ 전부 통과`). warn 4건은 published_at 미상 2건 + 관측 시점 미상 1건 + D등급 수치없음 1건 — 전부 정상적인 warn이고 error 아님.
- 못 찾은 것:
  - "번거롭다"는 반대 이유를 극복해 계약을 성사시킨 것 자체의 **성사율(close rate) before/after** 수치는 못 찾았다. 있는 건 이탈률(retention) 비교뿐이다 — 이 케이스의 병목은 CONVERSION 이지만 유일하게 확인된 정량 지표는 엄밀히는 RETENTION 성격이라는 점을 그대로 적었다(억지로 conversion rate 라고 이름 붙이지 않았다).
  - 마이그레이션 정책이 정확히 언제 "$79/5,000명" 문턱으로 공식화됐는지 날짜 미상 — observed_period_start 를 비웠다.
  - 콜드 이메일 세일즈 동선의 직접 세일즈만 떼어낸 순효과(다른 채널 배제) 수치는 원출처에도 없다 — 없는 걸 확인했다(확인 불가 아니라 음성).
  - ConvertKit 은 2024년 'Kit' 으로 리브랜딩했고 2026년 현재도 크리에이터 10만+ 규모로 운영 중임을 리뷰 사이트로 확인해 outcome_status='active' 로 적었다 — SEC 공시 대상이 아닌 비상장사라 1차 재무 공시는 없다.

## 배제 규칙 확인
큐가 준 제외 슬러그 목록(31개)에 `convertkit-*` 는 없어 신규 대상으로 확정했다. `slack-bottom-up-conversion`, `notion-template-gallery`, `homejoy-discount-conversion-collapse`(제외 목록에 있음) 가 기존 CONVERSION 병목 케이스였고, 이번 조사는 그중 어느 것과도 겹치지 않는 별도 레버(OFFER/OPERATIONS, 무료 마이그레이션 서비스 + 콜드 세일즈)를 다룬다.
