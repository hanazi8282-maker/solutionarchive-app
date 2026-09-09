# 조사 노트 — GoPro (AWARENESS, coverage_gap)

## 대상 선정
대상 미지정 상태로 시작. 큐 사유가 `coverage_gap`(AWARENESS 승인 케이스 2곳뿐, 매칭엔 3곳 필요)이라
**공시로 등급 A 를 받을 수 있는 AWARENESS 사례**를 기준으로 후보를 골랐다. 기존 적립 슬러그
(`elf-beauty-awareness-engine`, `figma-non-designer-distribution` 등)와 겹치지 않는 업종·메커니즘을 우선했다.

후보로 검토했다가 버린 것들:
- **Wendy's 트위터** — 공시(10-K)에 소셜 관여 수치가 없을 가능성이 높아 A 등급 경로가 약해 보임. 시간 제약상 추가 조사 안 함.
- **Poo-Pourri 바이럴 영상** — 비상장, 조사기관 추정치 외 1차 출처가 안 보임.
- **RXBAR 패키징** — Kellogg 10-K 는 인수 후 실적만 다루고 "왜"(패키징이 인지도를 어떻게 바꿨는지)를 직접 연결하는 공시 문장을 못 찾음.

**GoPro** 로 확정. 이유: 2014 IPO S-1 의 "Selected Consolidated Financial Data" 섹션에
2011~2013 매출·판매마케팅비가 감사 재무제표 기준으로 실려 있고, 같은 문서 본문에
UGC/바이럴 인지도 메커니즘을 직접 서술하고 있어 **수치와 메커니즘 서사가 같은 1차 공시 안에** 있다.

## 찾은 것
- S-1(2014-05-19, SEC EDGAR, accession 0001193125-14-204902) 재무제표:
  - 매출: 2011 $234.2M → 2012 $526.0M → 2013 $985.7M
  - 판매·마케팅비: 2011 $64.4M(27.5%) → 2012 $116.9M(22.2%) → 2013 $157.8M(16.0%)
  - 매출이 4.2배 느는 동안 매출 대비 판마비 비중은 27.5%→16.0%로 하락.
- 같은 S-1 본문: "The volume and quality of their shared GoPro content... are virally driving
  awareness and demand for our products." / 2013년 한 해 유튜브 'GoPro' 제목 영상 업로드량이
  약 2.8년 분량이라는 서술.
- 이 조합으로 무브 1건, 등급 A (법정 공시, 자기보고이나 법적 책임이 따르는 문서 경로).
  `is_issuer_defined_metric=false` — 재무제표 본문 수치(매출·비용)라 발행사 자체 정의 운영지표가 아님.
- 사업 지속 여부: GoPro Inc(GPRO)는 2025 회계연도 10-K 까지 공시가 이어지고 있어 `outcome_status=active` 로 적음(확인함, 추정 아님).

## 못 찾은 것 / 확인 불가
- **"마케팅비가 $50,000만 늘었는데 순이익이 크게 늘었다"는 통설** — Wall St. Daily 발 2차 인용을
  여러 마케팅 블로그가 반복하고 있으나, S-1 원문 재무제표와 대조하니 판매·마케팅비는
  2011→2013 사이 $64.4M→$157.8M 로 실제로는 크게 늘었다(그냥 매출이 더 빨리 늘어 비중이 줄었을 뿐).
  **이 통설은 원문과 불일치해 evidence 에 넣지 않았다.** (CLAUDE.md §7.1 이 우려하는 정확히 그 함정 —
  2차 요약을 검증 없이 썼으면 틀린 수치를 쌓을 뻔했다.)
- **UGC 서사 → 마케팅비 비중 하락의 인과** 는 S-1 본문의 자기 서술이다. 제3자가 독립적으로
  "UGC 때문에 비용이 줄었다"고 검증한 자료는 못 찾았다. 그래서 이 근거 행은 `supports_metric=false`
  로 서사만 지지하도록 남겼고, 수치(A등급)는 재무제표 행 1건만으로 세웠다.
- **채널 믹스(리테일 도매 vs 자사몰 직판 비중)** 를 못 찾아 `business_model` 을 `OTHER` 로 보수적으로
  적었다. D2C/WHOLESALE 어느 쪽이라고 단정할 근거가 부족했다.
- **YouTube 업로드량의 "before" 비교값** — "2013년 2.8년 분량"이라는 숫자에 대응하는 이전 연도
  수치를 못 찾아 별도 무브로 만들지 않았다(수치 없는 서술만으로는 D등급이라 굳이 추가 안 함).

## 결과 요약
- slug: `gopro-ugc-viral-awareness`
- 병목: AWARENESS
- 무브 수: 1 (lever=CONTENT)
- 무브 등급: A — 법정 공시 1건(S-1 재무제표, 자기보고이나 법적 책임 있는 문서)
- validate 실행 결과: `node scripts/case-research.mjs validate --slug gopro-ugc-viral-awareness` → **exit 0**, error 0건, warn 0건
