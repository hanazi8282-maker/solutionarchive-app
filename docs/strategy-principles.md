# 원칙 원장 (Corpus C) — SP-001 ~ SP-032

크로스섹션 어드바이저(§20 / §13-7)의 Corpus C. 수익화 리서치 문서 §22 를 구조화한
조각이다. **이 표가 정본이다.** `strategy_principles` 테이블은 이 표에서 시딩하고,
`scripts/strategy-principles-sync.mjs` 가 이 표를 다시 파싱해 upsert 한다.

행을 추가할 때 규칙:
- `ID` 는 `SP-NNN` (제로패딩 3자리).
- `evidence_grade` 셀은 `A|B|C|D` 로 시작하고, 뒤 괄호는 등급 주석(자유 텍스트).
- `태그` 는 쉼표로 구분. 매칭에 쓰인다 — 큐레이터가 "이 원칙이 어떤 질문에
  걸려야 하는가"를 보고 단다.
- **독자 태그(2026-09-21)**: `seller` 가 있는 행만 셀러 화면(처방·어드바이저 카드)에 나간다. 없는 행은
  우리 팀 운영 원칙(채널·법무·robots·인프라)이고 화면에 내지 않는다. `software` 는 그 원칙이 SaaS 전용이라
  물리 제품 질의에 제외된다는 뜻이다(lib/cases/advisor.ts PRINCIPLE_AUDIENCE_TAG).
- 추가 후 `node --env-file=.env.local scripts/strategy-principles-sync.mjs` 재실행.

| ID | 태그 | 진술(원칙/사실) | evidence_grade | 출처 |
|---|---|---|---|---|
| SP-001 | pricing, hybrid, seller, software | 하이브리드(구독+종량) 프라이싱이 2026년 B2B SaaS 채택률 1위(37%), 전년 대비 급증 | B (3자 서베이) | §0-1 |
| SP-002 | pricing, antipattern, seller, software | AdCreative.ai식 "크레딧 절벽"(no-rollover)은 확인된 이탈 유발 안티패턴 | B | §3 |
| SP-003 | pricing, antipattern, seller, software | Triple Whale식 "GMV 구간별 가격 점프"는 확인된 이탈 유발 안티패턴 | B | §3 |
| SP-004 | differentiation, evidence-grade, seller | evidence_grade(A/B/C/D) 노출은 경쟁사 중 확인된 선례가 없는 유일한 방어 가능 차별화 지점 | C (자체 판단) | §0-4 |
| SP-005 | reddit, api-risk | GummySearch는 Reddit 상업 라이선스 협상 실패로 셧다운(2025-11 신규가입 중단, 2026-12 데이터 삭제) — 단순 비용 문제가 아니라 협상 결렬이 원인 | B (창업자 자기보고 기반) | §0, §16 |
| SP-006 | reddit, architecture | PainMap은 Reddit API 완전 독립 아키텍처(라이브 AI 웹서치)로 API 리스크를 원천 제거 — 5개 경쟁사 중 유일하게 완전 독립 확인 | B (교차검증 완료) | §16 |
| SP-007 | channel, legal | G2·Capterra 이용약관은 스크래핑·자동수집을 명시적으로 금지(원문 직접 확인) | A (원문 직접 확인) | §18-2 |
| SP-008 | channel, legal | Product Hunt 공식 API는 상업적 이용 기본 금지, 비즈니스 문의 시 예외 가능 | A (공식 문서 직접 확인) | §18-2 |
| SP-009 | channel, legal | Apple App Store Connect API는 본인 소유 앱만 조회 가능 — 경쟁사 리뷰 조회 자체가 API 설계상 불가능 | A (공식 문서 직접 확인) | §18-2 |
| SP-010 | competitor, scantheg | ScanTheGap은 디지털 상품 전용(Buildability 필터로 실물 배제) — 솔루션아카이브와 인접시장이지 직접 경쟁 아님(초기 오판 정정됨) | B | §15 |
| SP-011 | legal, korea-crawling | 2026 저작권법 개정(8/11 시행)으로 고의 침해 시 최대 5배 징벌적 손해배상 가능, 네이버는 2026-02 크롤러 상대 DB침해 소송 승소 | A (법조문/판례) | §0-7 |
| SP-012 | falsification-market, data-sourcing | 반증마켓 콜드스타트 후보 4개 소스(ICPSR/Maven/CB Insights/Failory) 전부 상업적 노출 라이선스 저촉 확인 — 자동 백필 대신 수동 큐레이션으로 전환 | A (약관 원문 확인, Failory는 확인 실패로 별도 표기) | §17-3 |
| SP-013 | positioning, byo, seller | BYO(사용자 직접 입력)를 "임시방편"이 아니라 "우리는 리뷰를 훔쳐 팔지 않는다"는 신뢰 기반 포지셔닝으로 전환 가능 | C (자체 제안, 미검증) | §18 wildcard |
| SP-014 | channel, legal | G2 robots.txt는 Googlebot·Bingbot의 리뷰 크롤링은 허용하되 GPTBot·ClaudeBot·Google-Extended·CCBot 등 AI 크롤러는 리뷰 경로에서 별도 차단 — "일반 검색 노출엔 동의, AI 재사용엔 비동의"라는 입장을 기술적으로 명시 | A (robots.txt 직접 확인) | §21-A |
| SP-015 | channel, legal, korea | 한국법상 크롤링 리스크는 미국 판례뿐 아니라 데이터베이스제작자 권리(잡코리아 v 사람인)·부정경쟁방지법 카목(성과도용)·야놀자 v 여기어때(대법원, DB침해 무죄이나 접근제어 우회는 별도 유죄)까지 병존 | A (판례 직접 확인) | §21-A |
| SP-016 | channel, hacker-news | Hacker News(Firebase 공식 API)는 상업적 이용 금지 조항이 없는 것으로 확인된 사실상 유일한 완전 자유 채널 | B (약관 검토 기반, 확정 판례 아님) | §21-B |
| SP-017 | channel, aggregator, rejected | B2B 소셜데이터 애그리게이터(Octolens, SnitchFeed 등 월정액 구매형)는 §24 결정에 따라 폐기 — 구매형 데이터 조달 원칙 위배 | C (자체 판단) | §21-B, §24 |
| SP-018 | infra, bug, robots-txt, resolved | **✅ 해소됨 (2026-09-18 재확인).** 리뷰 수집 공용 robots.ts 가 RFC 9309 와일드카드(`Allow: /*.json$` 등)와 끝 앵커 `$` 를 구현하지 않아 오탐하던 문제 — HN 어댑터 추가 중 발견, `fix/robots-wildcard` 로 **수정 완료**. 현재 `lib/review/robots.ts` 의 `pathMatches()` 는 둘 다 구현한다(정규식이 아니라 투 포인터 글롭 — ReDoS 회피용으로 정규식을 버렸다). 2026-09-18 실측: `Allow: /*.json$` 매칭됨 · `Disallow: /companies/*/salaries_of_job_rank/` 해당 경로만 금지 · `Allow: /$` 는 `/` 만 허용 · `Disallow: /*?keyword=` 매칭됨. 수정의 부수 효과로 appstore 가 Apple robots 위반 상태였음이 드러났다(SP-019/021). ⚠️ **이 행은 "수정 확정"이라고 적혀 있어 2026-09-18 세션에서 조사 에이전트 둘에게 "아직 미수정"으로 읽혔다.** 남은 robots 결함은 SP-026(쿼리 미판정, 미해소)이고 와일드카드와 무관한 별개 건이다 | A (실측 확인 2026-09-10, 재확인 2026-09-18) | §26-2 |
| SP-019 | infra, legal, appstore | robots.ts 와일드카드 버그 수정 결과, appstore 어댑터가 Apple의 실제 robots.txt Disallow 규칙을 "규칙 없음=허용"으로 오판정해 위반 상태로 계속 수집해온 사실 확인 — 즉시 enabled=false로 중단 결정 | A (robots.txt 실측 확인) | §27 |
| SP-020 | channel, legal | Google Play 공개 페이지 스크래핑은 이용약관 3.3조에 "자동화된 수단으로 접근 금지 + robots.txt 준수 의무"가 원문으로 확인됨 | A (약관 원문 직접 확인) | §29 |
| SP-021 | channel, legal, conflict | App Store RSS 피드에 대해 우호적인 개발자포럼 답변이 있으나, 실측된 robots.txt가 해당 경로를 명시적으로 Disallow — 라이브 robots.txt가 과거 포럼 답변보다 우선한다고 판단해 SP-019의 중단 결정 유지 | A (robots.txt는 실측, 포럼 답변은 3자 정황) | §29 |
| SP-022 | channel, rejected | 유료 데이터벤더(Appfigures Public Data API add-on, Sensor Tower/data.ai, Datarade)는 전부 "구매형 데이터 조달" 범주로 배제 | B (공식 문서 기반) | §29 |
| SP-023 | competitor, market | G2가 Gartner로부터 Capterra·GetApp·Software Advice 인수를 2026-01-29 공식 발표(Q1 2026 종결 예정) — 향후 이 3사 약관이 G2 체계로 통합될 가능성, Tier 4 배제 목록 갱신 필요 시점 모니터링 | B (보도자료 기반) | §29 |
| SP-024 | advisor, matching, false-positive | 크로스섹션 어드바이저 Corpus A 점수는 `evidence_grade랭크 × 10 + 겹친 낱말 수` 라 등급 가중이 겹침 강도를 압도한다 — 광범위 도메인어 낱말 1개로 걸린 A등급 무브가 31점, 정확한 낱말 5개로 걸린 C등급 무브가 15점이라 "점수가 낮으면 저신뢰"가 성립하지 않는다. 불용어 필터(PR #43)는 낱말 목록만 고칠 뿐 이 역전을 못 막는다. 그래서 단일 낱말 매칭은 점수 임계로 숨기지 않고, 겹친 낱말·점수·"신뢰도 낮음"을 화면에 그대로 노출해 사람이 판단하게 한다 | A (산식 실측 — scripts/advisor-selftest.mjs 재현) | PR #43 후속 |

| SP-025 | channel, legal, community, risk-accepted | 다모앙(damoang.net) robots.txt 는 `anthropic-ai`·`Claude-Web`·`GPTBot`·`CCBot`·`Google-Extended` 등을 "AI 크롤러 차단 (콘텐츠 학습 방지)" 로 전면 금지하고, `trend-archive/0.1`·`CollectorHub/0.1` 같은 **자칭 수집기**도 이름을 확인하는 대로 차단 목록에 추가하며 "robots 는 의사 표시이고 분쟁 시 근거가 된다"고 문서에 적어 두었다 — 우리 UA(`solutionarchive-review-collector/0.1`)는 아직 목록에 없어 `User-agent: *` / `Allow: /` 가 적용돼 **기계 판정은 allowed** 지만, 사이트의 거부 의사가 우리 용도(AI 분석·콘텐츠 생성)를 덮는다. 남헌이 **2026-09-16 이 사실을 인지한 채로 수집 진행을 결정**했다(Reddit/SP-005 와 같은 리스크 수용 방식). 단 `enabled=false` 로 등록해 사람이 켜야 시작한다 | A (robots.txt 원문 실측 2026-09-16 + 사람 결정) | 2026-09-16 실측 |
| SP-026 | infra, bug, robots-txt | `lib/review/runner.ts:153` 이 `robotsVerdict(cached, u.pathname, PRODUCT_TOKEN)` 로 **쿼리스트링을 빼고** 판정을 부른다 — `robots.ts` 자체는 `*`·`$` 와 쿼리를 정확히 판정하는데(SP-018 로 수정됨), 호출부에서 `u.search` 가 잘려 `Disallow: /*?page=` (다모앙) 나 `Disallow: /entiz/read.php?bn=15&num=1166440&page=6` (82cook) 같은 **쿼리 대상 규칙이 어떤 경로와도 매칭되지 않는다.** 와일드카드 구현 여부와 무관한 별개 결함이고 전 소스에 동시 영향을 준다. 이번 커뮤니티 어댑터는 1글=1요청이라 이 구멍을 밟지 않지만(수집 URL 에 `?page=` 가 없다), **댓글 페이지네이션을 붙이려면 이 수정이 선행되어야 한다** — 안 고치고 붙이면 안전장치가 robots 위반을 못 막는다(§7.2) | A (실측 — 실제 robots 를 통과시켜 재현) | 2026-09-16 실측 |
| SP-027 | channel, legal, community, robots-txt, risk-accepted | 클리앙(clien.net)은 robots.txt 를 **User-Agent 로 게이팅**한다 — 2026-09-17 실측에서 우리 봇 UA 로는 `www.clien.net/robots.txt` 와 `clien.net/robots.txt` 가 **둘 다 HTTP 404**(315B 아파치 기본 문서)인데, 브라우저 UA 로 요청하면 `www` 쪽이 **200 에 1,691B 의 실제 규칙**(`Allow:/service/board/`, `Disallow:/service/board/sold/`·`hongbo/`·`/service/group/`·`/*?*` 등)을 내려준다. apex 는 양쪽 UA 모두 404 라 "www/apex 호스트 분열"이 아니라 UA 게이팅이다. 러너는 4xx 를 "규칙 없음 = 허용"으로 캐시하므로(`runner.ts`), **사이트가 실제로 건 규칙이 판정에 단 한 번도 반영되지 않는다** — 안전장치가 초록불을 띄우는 형태다(CLAUDE.md §7.2). UA 위장으로 읽어 오는 것은 프로브 규칙(UA 위장 금지)에 걸려 하지 않는다. 대신 82cook 의 `ROBOTS_DENY` 선례대로 **규칙을 어댑터가 코드로 내재화**했다(`lib/review/adapters/clien.ts` 의 `parseProductRef` — 쿼리 금지 + `/service/board/` 접두 + sold·hongbo 제외). 그 함수가 **유일한 방어선**이다. 이 사실을 인지한 채 수집 진행을 결정했고, `enabled=false` 로 등록해 사람이 켜야 시작한다  **⚠️ 2026-09-18 정정(SP-032):** '러너가 4xx 를 규칙 없음 = 허용으로 캐시한다' 는 더 이상 사실이 아니다 — 4xx 는 `unverified` 이고 러너는 요청하지 않는다. 그래서 이 소스가 도는 것은 `clien.ts` 의 `proceedWhenRobotsUnverified: ['www.clien.net']` 표식 때문이고, **규칙을 못 본다는 사실 자체는 그대로다.** `parseProductRef` 가 여전히 유일한 방어선이다| A (양 호스트 × 양 UA 4조합 실측 2026-09-17 + 사람 결정) | 2026-09-17 실측 |
| SP-028 | channel, legal, community, risk-accepted | 에펨코리아(fmkorea.com) robots.txt 의 첫 그룹이 `anthropic-ai`·`ClaudeBot`·`GPTBot`·`PerplexityBot`·`CCBot`·`Google-Extended` 등 38개 토큰을 `Disallow: /` + `Allow: /$` 로 **메인페이지만 남기고 전면 금지**한다. 우리 토큰은 그 목록에 없어 `User-agent: *` 그룹(`Disallow: /` 뒤에 `Allow: /$ /best /best2 /humor`)을 받아 **기계 판정은 allowed** 지만, 사이트의 거부 의사가 우리 용도를 덮는다 — SP-025(다모앙)와 같은 형태다. 이 사실을 인지한 채 수집 진행을 결정했고, 어댑터가 수집 범위를 `/best`·`/best2`·`/humor` 로 못박아(`/8123456` 같은 XE 기본 주소는 ref 단계에서 거부) `enabled=false` 로 등록한다 | A (robots.txt 원문 실측 2026-09-17 + 사람 결정) | 2026-09-17 실측 |
| SP-029 | infra, bug, robots-txt, resolved | **✅ 해소됨 (SP-018 과 함께, 2026-09-18).** SP-018(robots.ts 와일드카드 미구현)의 구체적 피해 지점 확인 — 퀘이사존·루리웹의 금지 규칙이 전부 와일드카드(`/*/comments*`, `/*view=`)라 당시 파서는 하나도 읽지 못했다. 두 소스는 와일드카드 구현 전에 어댑터를 만들면 금지 경로를 긁게 되는 상태였다. 2026-09-21 PR #106 의 YouTube 어댑터가 main 에 이식되면서(#185) 결번이던 이 행을 원장에 정식 편입 — 내용은 그 브랜치 원문 그대로이고 "해소됨" 표시만 얹었다 | A (robots.txt 실측 + 코드 대조) | §30 |

### SP-027 / SP-028 실측 근거

- 세 호스트(brunch·clien·fmkorea) robots.txt 원문·측정 일시·셀렉터 대조는
  `docs/review-source-findings.md` "커뮤니티 소스 실측 round-3 (2026-09-17)" 에 있다.
- SP-027 재현: `node scripts/review-robots-selftest.mjs` — 404 본문을 `parseRobots`
  에 넣으면 규칙 0개 · `allowed=true '규칙 없음'` 이 되어 **실재하는 규칙과 값이
  구분되지 않는 것**을 고정한다. 바로 아래에 브라우저 UA 로 받은 진짜 규칙을 두고
  `/service/board/sold/1` → `allowed=false` 를 단정한다 — 두 줄의 차이가 구멍이다.
- ⚠️ SP-027 에는 **곁다리 발견**이 하나 더 있다. 클리앙의 `Disallow: /*?*` 는
  최장 일치 규칙상 게시판 글에 **안 걸린다**(`Allow:/service/board/` 20자 >
  `Disallow: /*?*` 4자). 즉 표준대로 판정하면 `?po=2` 가 붙은 글도 허용이다.
  어댑터는 사이트 의도를 따라 **기계 판정보다 더 엄격하게** 쿼리형 ref 를 거부한다.
  이 차이는 숨기지 않고 셀프테스트에 단정문으로 적어 뒀다(§7.1).
- SP-028 재현: 같은 스크립트에서 `/best/1` → `allowed=true 'Allow: /best'`,
  `/8123456` → `allowed=false`, 그리고 토큰을 `claudebot` 으로 바꾸면 `/best/1` 이
  `allowed=false` 가 되는 것(= 우리가 그 그룹에 없어서 통과한다는 증거)을 고정한다.
- **이번 PR 범위 아님.** `runner.ts`·`robots.ts` 는 한 줄도 건드리지 않았다.
  SP-026(쿼리 미판정)도 그대로 남아 있고, 이번 세 어댑터는 전부 1글=1요청이라
  쿼리를 만들지 않아 그 구멍을 밟지 않는다.

| SP-030 | channel, legal, naver, risk-accepted | 네이버 서비스 이용약관(2025-07-10 시행)이 "네이버의 사전 허락 없이 자동화된 수단(예: 매크로 프로그램, 로봇(봇), 스파이더, 스크래퍼 등)을 이용하여 … 네이버 서비스에 게재된 회원의 아이디(ID), **게시물 등을 수집**하거나 … 해서는 안 됩니다" 라고 우리 행위를 문장으로 직접 지목해 금지한다. `blog.naver.com/robots.txt` 본문에도 "BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND RETRIEVAL-AUGMENTED GENERATION (RAG) IS STRICTLY PROHIBITED" 가 적혀 있고 `ClaudeBot`·`Claude-SearchBot`·`GPTBot`·`PerplexityBot` 이 이름으로 전면 금지돼 있다. 우리 UA 토큰은 그 목록에 없어 `*` 그룹이 적용되고 수집 경로(`/PostView.naver`)는 Disallow 에 없어 **기계 판정은 allowed** 다 — 그 판정을 근거로 쓰면 안 된다. SP-025(다모앙)는 robots 의 **의사 표시**라 해석 여지가 있었지만 여기는 **약관 본문이 명시적**이라 한 층 위다. 남헌이 **2026-09-17 이 사실을 인지한 채로 수집 진행을 결정**했다(SP-025·SP-005 와 같은 리스크 수용). 수용 조건: `enabled=false` 등록(사람이 켠다) · 댓글 미수집(cbox 는 별도 호스트 `apis.naver.com`) · 본문 1건만 | A (약관·robots 원문 직접 확인 2026-09-17 + 사람 결정) | 2026-09-17 실측 |
| SP-031 | channel, legal, tumblbug, risk-accepted | 텀블벅 이용약관의 "자동화된 수단으로 서비스를 조작·이용" 금지 조항을 인지한 채로 남헌이 2026-09-17 수집 진행을 결정했다(약관 페이지가 클라이언트 렌더라 원문 재확인은 실패 — 조항 존재는 설계 단계 확인에 의존한다). 더 중요한 것은 **수집 대상이 실측 때문에 바뀌었다**는 점이다: 원래 설계한 후원자 코멘트·프로젝트 설명은 정적 HTML 에 **0건**이고(hydration JSON 에 코멘트 스토어 자체가 없고 `project.story` 는 null) 둘 다 robots 가 막은 `/api/` XHR 로만 온다. 정적으로 오는 유일한 VOC 는 `MOBX_STATE.projectStore.creators[i][1].review.contents[]` 의 **"이 창작자의 지난 프로젝트 후기" 프리뷰(창작자당 최대 4건)** 라서 수집 축이 상품→창작자로 바뀌었다. 한 페이지의 프리뷰에는 그 창작자의 **다른 프로젝트 후기가 섞여 온다.** 처음 판은 "`external_id` 에 경로를 안 넣으면 지문이 중복을 걸러 준다"고 적었는데 **틀렸고 재현으로 확인했다**: 공용 `computeFingerprint` 의 identity_key 가 `sha256(source_key + product_ref + external_id)` 라 product_ref 가 키에 들어간다 — 같은 후기를 `/eastereggs` 타깃과 `/clear` 타깃이 각각 내면 키가 달라져 **4건이 8행으로 적재된다**(identity_key 교집합 0/4). 지문은 8개 소스가 공유하므로 고치지 않고 **어댑터가 공용 계약을 지키는 쪽으로** 바꿨다: (1) `projectPermalink` 이 product_ref 의 slug 와 같은 후기만 받고 나머지는 `filtered`(파싱 실패 아님)로 센다 — 후기 하나가 자기 프로젝트 타깃 한 곳에서만 나오므로 타깃이 겹쳐도 중복이 없고, 남의 프로젝트 후기가 이 타깃 project_id 로 적재되던 오류도 사라진다 (2) 그래서 타깃 1개의 수확은 4건보다 적다(실측 `/eastereggs` 2건, `/cairn` 0건) — 창작자의 4건을 다 받으려면 후기가 달린 프로젝트를 각각 타깃으로 등록한다 (3) 마커(66)와 항목(4)의 차이를 실패로 세면 안 된다 — 프리뷰 상한이다 | A (페이지 구조·창작자 URL 부재 실측 2026-09-17 + 중복 재현 + 사람 결정) | 2026-09-17 실측 |
| SP-032 | infra, bug, robots-txt, safety | 리뷰 수집 러너가 **robots 를 못 읽은 것을 전부 "허용"으로 접고 있었다.** 2026-09-18 VOC 소스 조사 20곳에서 구멍 3곳이 실측으로 드러났다. ① `RobotsCache` 가 4xx 를 `[]`(규칙 0개 = 허용)로 캐시했다 — 그 4xx 본문은 실제로는 robots 를 감춘 HTML 이었다(킥스타터 403 Cloudflare 챌린지 · `www.tistory.com` 404 · theqoo/todayhumor 404 · 클리앙은 우리 UA 에게만 404=SP-027). ② 캐시 키가 **요청한** origin 이라, robots 가 다른 호스트로 리다이렉트되면 그쪽 규칙이 요청 호스트에 이식됐다(SOOP `.co.kr → .com` 에서 `www`=`Allow: /` 와 `vod`=`Disallow: /api/` 가 다르다). ③ 우리 UA 에 적용되는 그룹이 없으면 자동 허용이었다(`goodchoice.kr` 은 200 인데 `User-agent: *` 그룹이 아예 없다). 수정: 판정을 **3상태**(`allowed`/`disallowed`/`unverified`)로 갈랐고 `unverified` 는 요청하지 않는다(fail-closed). 캐시 키는 robots 를 **실제로 읽은 최종 URL 의 origin** 이다. 이미 robots 404 로 등록된 소스(hackernews·theqoo·todayhumor·clien)는 어댑터의 `proceedWhenRobotsUnverified` **호스트 표식**으로만 통과하고, 그 표식은 `disallowed` 와 5xx·네트워크 오류를 뚫지 못한다. ⚠️ `*` 그룹이 있고 규칙이 0개인 경우(velog 57B · docs.github.com 13B)는 RFC 9309 대로 **허용**으로 남겼다 — 다만 사유 문장을 따로 내 "금지하지 않았다"를 "허용해 줬다"로 읽지 못하게 했다. 함께 수정: robots 의 `Crawl-delay` 파서가 아예 없어 DB `min_interval_ms` 의 손입력이 유일한 방어선이었다(brunch 가 그 경우). 이제 파서가 읽고 Pacer 가 **DB 값과 큰 쪽**을 쓴다 | A (실측 — 실제 응답 원문을 통과시켜 재현, `fix/robots-fail-closed`) | 2026-09-18 실측 |

### SP-032 실측 근거

- 브랜치 `fix/robots-fail-closed`. 코드는 `lib/review/robots.ts`(3상태 판정 ·
  `looksLikeMarkup` · `robotsCrawlDelaySec`)와 `lib/review/runner.ts`
  (`RobotsCache` · `Pacer`), 표식 필드는 `lib/review/types.ts` 의
  `ReviewSourceAdapter.proceedWhenRobotsUnverified`.
- 재현: `node scripts/review-robots-selftest.mjs`(순수 판정) ·
  `node scripts/review-runner-selftest.mjs`(러너 경로 — 403/404/HTML 본문 ·
  `*` 그룹 없음 · `*` 그룹 있고 규칙 0개 · origin 갈림 · 표식 통과/미통과 ·
  Crawl-delay). 둘 다 픽스처만 쓰므로 네트워크·DB 없이 돈다.
- 라이브 프로브 실측(2026-09-18, 정직 UA, 호스트당 1요청):
  `prod.danawa.com/robots.txt` → 200 · 222B · 리다이렉트 없음 ·
  `*` 그룹에 접두 규칙 5개(`/api/` `/bridge/` `/community/` `/list/ajax/`
  `/info/ajax/`) · 와일드카드 0개 · 쿼리 대상 규칙 0개.
  `hn.algolia.com/robots.txt` → 404 · 207B · 리다이렉트 없음(2026-09-10 최초
  실측과 동일).
- ⚠️ **SP-026 은 이 브랜치에서 고치지 않았다.** 러너가 판정에 `u.search` 를
  넘기지 않는 문제는 그대로다. 방향이 반대라서다 — 이 브랜치는 "못 읽은 것을
  통과시키던" 구멍을 막고, SP-026 은 "읽은 규칙을 쿼리형 URL 에 적용하는" 것이라
  **등록된 소스를 새로 막을 수 있다**(82cook `/entiz/read.php?bn=..&num=..` ·
  naver_blog_post `PostView.naver?blogId=..` · todayhumor
  `/board/view.php?table=..&no=..` 가 전부 쿼리형 경로다). 소스별 robots 실측이
  선행돼야 한다. danawa(현재 유일하게 도는 스크래핑 소스)는 위 실측대로 쿼리를
  넣어도 5개 규칙 어디에도 안 걸려 영향이 없다.

### SP-030 / SP-031 실측 근거

⚠️ **번호 주의.** 이 두 항목은 원래 SP-027 · SP-028 로 쓰라는 지시를 받았지만,
`origin/feat/review-sources-expand` 브랜치가 **SP-027(Reddit 약관) · SP-028(커뮤니티
8곳 실측) · SP-029(robots 와일드카드 피해 지점)** 을 이미 쓰고 있어 030·031 로
옮겼다. `strategy-principles-sync.mjs` 는 ID 로 upsert 하므로, 번호가 겹친 채로
양쪽이 머지되면 **한쪽 원칙이 조용히 덮인다.** 새 SP 를 달기 전에
`git branch -r` 의 다른 브랜치까지 확인해라.

- 약관 원문: `https://policy.naver.com/rules/service.html` (시행일 2025-07-10).
  robots 원문·댓글 cbox 판정·예쁜 URL 껍데기(200/2,817 bytes)·창작자 URL 부재
  실측은 `docs/review-source-findings.md` "VOC 소스 3종 실측 — tumblbug ·
  naver_blog · bobaedream (2026-09-17)" §1~§2 에 있다.
- SP-030 재현: `node scripts/review-robots-selftest.mjs` — 실제 원문으로
  `ClaudeBot` → `allowed=false`, 같은 경로에 우리 토큰 → `allowed=true` 를
  나란히 고정한다. **두 줄이 같이 참인 것**이 "기계 판정을 근거로 쓰면 안 된다"의
  증거다.
- SP-031 재현: `node scripts/review-tumblbug-selftest.mjs` — "타깃간중복" 블록이
  **진짜** `computeFingerprint` 와 `store.ts` 의 판정 분기를 옮긴 인메모리 store 로
  같은 창작자를 두 프로젝트로 타깃팅해, 4건이 4행으로 들어가는지를 단정한다
  (고치기 전엔 8행이었다). "프로젝트스코프" 블록이 두 타깃의 후기 교집합 0건을,
  "프리뷰상한" 블록이 마커 66 vs 항목 4 에서 `parseFailures=0` 을 고정한다.
  같은 재현이 `node scripts/review-runner-selftest.mjs` 에도 있다 — 어댑터만
  통과하고 러너와 붙이면 틀리는 경우를 막는다(§7.1 사례 5).
- 킬스위치: 두 소스 다 `enabled=false` 로 등록된다. 되돌리는 문장은
  `supabase/migrations/20260918000001_review_sources_voc_round3_rollback.sql`.
- 이 결정들은 **리스크를 없앤 것이 아니라 받아들인 것**이다. 상황이 바뀌면
  (경고 메일·차단·약관 개정) 위 롤백부터 돌리고 여기를 다시 쓴다.

### SP-025 / SP-026 실측 근거

- 두 호스트 robots.txt 원문·측정 일시·셀렉터 대조는 `docs/review-source-findings.md`
  "커뮤니티 소스 실측 — damoang · 82cook (2026-09-16)" 에 있다.
- SP-026 재현: `node scripts/review-robots-selftest.mjs` — 실제 원문으로
  `/free/7341567?page=2` → `allowed=false 'Disallow: /*?page='`,
  `/entiz/read.php` (쿼리 제거) → `allowed=true` 를 고정한다. 뒤 줄이 구멍의 증거다.
- **이번 PR 범위 아님.** `runner.ts` 는 한 줄도 건드리지 않았다. 전 소스의 robots
  판정에 동시에 영향을 주므로 별건 PR 로 다룬다. 그때까지의 방어는 어댑터 쪽에 있다:
  다모앙 어댑터는 `?page=` 를 아예 만들지 않고, 82cook 어댑터는 robots 가 금지한
  그 URL 1건을 `parseProductRef` 에서 직접 거부한다(`lib/review/adapters/82cook.ts`).

### SP-024 실측 근거

- 산식 위치: `lib/cases/advisor.ts` `matchCaseMoves()` — `score = (GRADE_RANK[m.evidence_grade] ?? 0) * 10 + matched.length`, `GRADE_RANK = { A: 3, B: 2, C: 1, D: 0 }` (`lib/cases/match.ts`).
- 그래서 겹친 낱말이 **1개뿐인** 무브의 점수는 등급에 따라 11(C) · 21(B) · 31(A) 로 고정된다. 낱말 5개로 걸린 C등급 무브(15점)가 낱말 1개짜리 A등급 무브(31점)보다 아래로 간다.
- 재현: `node scripts/advisor-selftest.mjs` — "SP-024" 로 시작하는 단정문들이 이 역전과 `low_confidence` 판정을 고정한다. 픽스처만 쓰므로 네트워크·DB 없이 돈다.
- **이 세션에서 확인하지 못한 것:** 09-11 델리게이션이 인용했다는 프로덕션 실측(탈모 샴푸 앵글 × DTC 케이스무브 2건)은 이 세션에 DB 접근 권한이 없어 재현하지 못했다. 위 진술의 근거는 프로덕션 관측이 아니라 산식·픽스처 재현이다. 프로덕션 전수 매칭을 다시 보려면 `scripts/advisor-corpus-audit.mjs` 에 덤프를 넣는다.
