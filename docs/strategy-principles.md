# 원칙 원장 (Corpus C) — SP-001 ~ SP-024

크로스섹션 어드바이저(§20 / §13-7)의 Corpus C. 수익화 리서치 문서 §22 를 구조화한
조각이다. **이 표가 정본이다.** `strategy_principles` 테이블은 이 표에서 시딩하고,
`scripts/strategy-principles-sync.mjs` 가 이 표를 다시 파싱해 upsert 한다.

행을 추가할 때 규칙:
- `ID` 는 `SP-NNN` (제로패딩 3자리).
- `evidence_grade` 셀은 `A|B|C|D` 로 시작하고, 뒤 괄호는 등급 주석(자유 텍스트).
- `태그` 는 쉼표로 구분. 매칭에 쓰인다 — 큐레이터가 "이 원칙이 어떤 질문에
  걸려야 하는가"를 보고 단다.
- 추가 후 `node --env-file=.env.local scripts/strategy-principles-sync.mjs` 재실행.

| ID | 태그 | 진술(원칙/사실) | evidence_grade | 출처 |
|---|---|---|---|---|
| SP-001 | pricing, hybrid | 하이브리드(구독+종량) 프라이싱이 2026년 B2B SaaS 채택률 1위(37%), 전년 대비 급증 | B (3자 서베이) | §0-1 |
| SP-002 | pricing, antipattern | AdCreative.ai식 "크레딧 절벽"(no-rollover)은 확인된 이탈 유발 안티패턴 | B | §3 |
| SP-003 | pricing, antipattern | Triple Whale식 "GMV 구간별 가격 점프"는 확인된 이탈 유발 안티패턴 | B | §3 |
| SP-004 | differentiation, evidence-grade | evidence_grade(A/B/C/D) 노출은 경쟁사 중 확인된 선례가 없는 유일한 방어 가능 차별화 지점 | C (자체 판단) | §0-4 |
| SP-005 | reddit, api-risk | GummySearch는 Reddit 상업 라이선스 협상 실패로 셧다운(2025-11 신규가입 중단, 2026-12 데이터 삭제) — 단순 비용 문제가 아니라 협상 결렬이 원인 | B (창업자 자기보고 기반) | §0, §16 |
| SP-006 | reddit, architecture | PainMap은 Reddit API 완전 독립 아키텍처(라이브 AI 웹서치)로 API 리스크를 원천 제거 — 5개 경쟁사 중 유일하게 완전 독립 확인 | B (교차검증 완료) | §16 |
| SP-007 | channel, legal | G2·Capterra 이용약관은 스크래핑·자동수집을 명시적으로 금지(원문 직접 확인) | A (원문 직접 확인) | §18-2 |
| SP-008 | channel, legal | Product Hunt 공식 API는 상업적 이용 기본 금지, 비즈니스 문의 시 예외 가능 | A (공식 문서 직접 확인) | §18-2 |
| SP-009 | channel, legal | Apple App Store Connect API는 본인 소유 앱만 조회 가능 — 경쟁사 리뷰 조회 자체가 API 설계상 불가능 | A (공식 문서 직접 확인) | §18-2 |
| SP-010 | competitor, scantheg | ScanTheGap은 디지털 상품 전용(Buildability 필터로 실물 배제) — 솔루션아카이브와 인접시장이지 직접 경쟁 아님(초기 오판 정정됨) | B | §15 |
| SP-011 | legal, korea-crawling | 2026 저작권법 개정(8/11 시행)으로 고의 침해 시 최대 5배 징벌적 손해배상 가능, 네이버는 2026-02 크롤러 상대 DB침해 소송 승소 | A (법조문/판례) | §0-7 |
| SP-012 | falsification-market, data-sourcing | 반증마켓 콜드스타트 후보 4개 소스(ICPSR/Maven/CB Insights/Failory) 전부 상업적 노출 라이선스 저촉 확인 — 자동 백필 대신 수동 큐레이션으로 전환 | A (약관 원문 확인, Failory는 확인 실패로 별도 표기) | §17-3 |
| SP-013 | positioning, byo | BYO(사용자 직접 입력)를 "임시방편"이 아니라 "우리는 리뷰를 훔쳐 팔지 않는다"는 신뢰 기반 포지셔닝으로 전환 가능 | C (자체 제안, 미검증) | §18 wildcard |
| SP-014 | channel, legal | G2 robots.txt는 Googlebot·Bingbot의 리뷰 크롤링은 허용하되 GPTBot·ClaudeBot·Google-Extended·CCBot 등 AI 크롤러는 리뷰 경로에서 별도 차단 — "일반 검색 노출엔 동의, AI 재사용엔 비동의"라는 입장을 기술적으로 명시 | A (robots.txt 직접 확인) | §21-A |
| SP-015 | channel, legal, korea | 한국법상 크롤링 리스크는 미국 판례뿐 아니라 데이터베이스제작자 권리(잡코리아 v 사람인)·부정경쟁방지법 카목(성과도용)·야놀자 v 여기어때(대법원, DB침해 무죄이나 접근제어 우회는 별도 유죄)까지 병존 | A (판례 직접 확인) | §21-A |
| SP-016 | channel, hacker-news | Hacker News(Firebase 공식 API)는 상업적 이용 금지 조항이 없는 것으로 확인된 사실상 유일한 완전 자유 채널 | B (약관 검토 기반, 확정 판례 아님) | §21-B |
| SP-017 | channel, aggregator, rejected | B2B 소셜데이터 애그리게이터(Octolens, SnitchFeed 등 월정액 구매형)는 §24 결정에 따라 폐기 — 구매형 데이터 조달 원칙 위배 | C (자체 판단) | §21-B, §24 |
| SP-018 | infra, bug, robots-txt | 리뷰 수집 공용 robots.ts가 RFC 9309 와일드카드(Allow: /*.json$ 등)를 구현하지 않아 오탐 가능 — HN 어댑터 추가 중 발견, fix/robots-wildcard 브랜치로 수정 확정 | A (실측 확인) | §26-2 |
| SP-019 | infra, legal, appstore | robots.ts 와일드카드 버그 수정 결과, appstore 어댑터가 Apple의 실제 robots.txt Disallow 규칙을 "규칙 없음=허용"으로 오판정해 위반 상태로 계속 수집해온 사실 확인 — 즉시 enabled=false로 중단 결정 | A (robots.txt 실측 확인) | §27 |
| SP-020 | channel, legal | Google Play 공개 페이지 스크래핑은 이용약관 3.3조에 "자동화된 수단으로 접근 금지 + robots.txt 준수 의무"가 원문으로 확인됨 | A (약관 원문 직접 확인) | §29 |
| SP-021 | channel, legal, conflict | App Store RSS 피드에 대해 우호적인 개발자포럼 답변이 있으나, 실측된 robots.txt가 해당 경로를 명시적으로 Disallow — 라이브 robots.txt가 과거 포럼 답변보다 우선한다고 판단해 SP-019의 중단 결정 유지 | A (robots.txt는 실측, 포럼 답변은 3자 정황) | §29 |
| SP-022 | channel, rejected | 유료 데이터벤더(Appfigures Public Data API add-on, Sensor Tower/data.ai, Datarade)는 전부 "구매형 데이터 조달" 범주로 배제 | B (공식 문서 기반) | §29 |
| SP-023 | competitor, market | G2가 Gartner로부터 Capterra·GetApp·Software Advice 인수를 2026-01-29 공식 발표(Q1 2026 종결 예정) — 향후 이 3사 약관이 G2 체계로 통합될 가능성, Tier 4 배제 목록 갱신 필요 시점 모니터링 | B (보도자료 기반) | §29 |
| SP-024 | advisor, matching, false-positive | 크로스섹션 어드바이저 Corpus A 점수는 `evidence_grade랭크 × 10 + 겹친 낱말 수` 라 등급 가중이 겹침 강도를 압도한다 — 광범위 도메인어 낱말 1개로 걸린 A등급 무브가 31점, 정확한 낱말 5개로 걸린 C등급 무브가 15점이라 "점수가 낮으면 저신뢰"가 성립하지 않는다. 불용어 필터(PR #43)는 낱말 목록만 고칠 뿐 이 역전을 못 막는다. 그래서 단일 낱말 매칭은 점수 임계로 숨기지 않고, 겹친 낱말·점수·"신뢰도 낮음"을 화면에 그대로 노출해 사람이 판단하게 한다 | A (산식 실측 — scripts/advisor-selftest.mjs 재현) | PR #43 후속 |

### SP-024 실측 근거

- 산식 위치: `lib/cases/advisor.ts` `matchCaseMoves()` — `score = (GRADE_RANK[m.evidence_grade] ?? 0) * 10 + matched.length`, `GRADE_RANK = { A: 3, B: 2, C: 1, D: 0 }` (`lib/cases/match.ts`).
- 그래서 겹친 낱말이 **1개뿐인** 무브의 점수는 등급에 따라 11(C) · 21(B) · 31(A) 로 고정된다. 낱말 5개로 걸린 C등급 무브(15점)가 낱말 1개짜리 A등급 무브(31점)보다 아래로 간다.
- 재현: `node scripts/advisor-selftest.mjs` — "SP-024" 로 시작하는 단정문들이 이 역전과 `low_confidence` 판정을 고정한다. 픽스처만 쓰므로 네트워크·DB 없이 돈다.
- **이 세션에서 확인하지 못한 것:** 09-11 델리게이션이 인용했다는 프로덕션 실측(탈모 샴푸 앵글 × DTC 케이스무브 2건)은 이 세션에 DB 접근 권한이 없어 재현하지 못했다. 위 진술의 근거는 프로덕션 관측이 아니라 산식·픽스처 재현이다. 프로덕션 전수 매칭을 다시 보려면 `scripts/advisor-corpus-audit.mjs` 에 덤프를 넣는다.
