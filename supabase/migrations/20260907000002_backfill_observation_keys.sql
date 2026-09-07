-- 20260907000002_backfill_observation_keys.sql
--
-- 20260907000001 이 만든 두 컬럼(observation_key / supports_metric)을 채운다.
-- L-60(원 관측 판별) + L-64(근거가 어느 주장을 받치는지)의 실데이터 백필.
--
-- ★ 조사 방식(11차): 근거 72행을 원 URL 기준 ~48개 문서로 묶어 각각 확인.
--   - 재fetch 성공: 국내 매체(뉴스1·더벨·디지털데일리·연합·매경), Retail Dive 2건,
--     TechCrunch(slack), Duolingo IR, Sensor Tower, Syncly, THE VC.
--   - 1차 fetch 실패분은 web.archive.org 스냅샷으로 뚫었다: medium/@venturetwins
--     (Cloudflare 403 → wayback 20240203164711), indigo9digital(→ wayback 20250803090020).
--     둘 다 Casper S-1 재작성으로 확정 — casper-s1-2020 동일 키.
--   - SEC 공시(10-K/S-1/20-F/F-1/6-K/실적발표) 약 30행: 전문이 커서 WebFetch 로는
--     표까지 재추출이 안 된다. 문서종류·회계연도는 재확인했고(예: Chewy 10-K FYE
--     2024-01-28, Nubank 20-F 2022, ARPAC 문장 직접 확인), 표 수치는 지난 라운드가
--     curl 로 대조해 스니펫에 박아 둔 인용을 근거로 키를 매겼다. §7.1 상 이 행들은
--     "이번 라운드 신규 대조"가 아니라 "지난 라운드 대조 + 문서 재식별"이다.
--   - 끝내 NULL: influencers-time(출처 없는 'reportedly', 원 관측 식별 불가),
--     techcrunch/figma(현재 404 — 지난 라운드 판정 'S-1 재작성, 수치 뒷받침 아님' 유지, sm=false),
--     그리고 서사만 받치는 3차 글 3건(substack/duolingo, bettermode·foundationinc/notion) 은 sm=false 만.
--
-- ★ 키 규약: <발행주체>-<문서종류>-<기간>, 소문자·하이픈. "이 행이 사라지면
--   우리가 잃는 관측이 무엇인가" 로 갈랐다. 같은 공시를 옮겨 적은 매체(귀속 문구
--   "according to the company / CFO", "실적발표에서") 는 원 문서와 같은 키.
--   회사 밖 독립 측정(Sensor Tower 패널, Earnest 카드 패널) 만 별도 키 — 다만
--   둘 다 is_estimate=true 라 교차 확인 카운트에는 안 들어간다.
--
-- ★ 백필 후 재채점(실 gradeMove, DB 반영 완료 2026-09-07): A13·B5·C13·D1 → A12·B0·C19·D1.
--   바뀐 6개 = beauty-of-joseon/CHANNEL(A→C) + 기존 B 5건 전부 C. --force 투영과
--   같은 등급이나 잠정(provisional) 표시가 15 → 4 로 준다. 남은 4개(bj/CHANNEL,
--   figma/PF, slack/PRICING, warby/CHANNEL)는 2차 출처를 "재작성으로 판정(sm=false)"해서
--   붙은 표시라 등급은 확정이다. regrade 재실행 시 바뀐 것 0(멱등). review_status 는 안 건드렸다.
--
-- ★ 스키마 변경 없음. UPDATE 만. 이 파일은 2026-09-07 에 남헌 승인 하에 직접 적용됐다(§12-5 예외).

BEGIN;

-- ── bedtimes-ceo-interview-2020 (1행) ─────────────────────────────────
--   [8c4eb842] purple-innovation-capacity-scaleup / (case-level)  secondary
--   근거: BedTimes(2020-09) CEO Joe Megibow 인터뷰. 케이스 단위 근거 - supports_metric NULL. 전부 CEO 발언이라 is_self_reported=true.
UPDATE public.case_evidence SET observation_key='bedtimes-ceo-interview-2020', supports_metric=NULL
 WHERE id='8c4eb842-42bc-490f-b051-71817579115c';

-- ── casper-s1-2020 (4행) ──────────────────────────────────────────────
--   [6e49f997] casper-dtc-unit-economics / OFFER (undefined)  primary
--   근거: Casper S-1(2020-01-10). 판매·마케팅비 원 수치(43%->35%).
UPDATE public.case_evidence SET observation_key='casper-s1-2020', supports_metric=true
 WHERE id='6e49f997-8768-4957-9320-8ad2509d0148';
--   [ebcbc7c8] casper-dtc-unit-economics / CHANNEL (undefined)  primary
--   근거: Casper S-1. '재구매 고객 16%' 등 원 수치.
UPDATE public.case_evidence SET observation_key='casper-s1-2020', supports_metric=true
 WHERE id='ebcbc7c8-9b18-45d0-9a3f-c1a21bf16461';
--   [1553a883] casper-dtc-unit-economics / OFFER (undefined)  secondary
--   근거: indigo9digital(Tricia McKinnon). web.archive.org(20250803090020) 스냅샷으로 확인 —
--     '2017 Casper sales and marketing expenses were 43% of revenue and in 2018 they were 35%'.
--     43%/35% 는 S-1 공시 수치이고 독립 측정 주장 없음(Gartner 인용은 업계 평균용) -> S-1 재작성, 동일 키.
UPDATE public.case_evidence SET observation_key='casper-s1-2020', supports_metric=true
 WHERE id='1553a883-fdae-40d9-acd1-ac05fa58d3a2';
--   [afd7e22e] casper-dtc-unit-economics / CHANNEL (undefined)  secondary
--   근거: medium/@venturetwins(Justine Olivia Moore, a16z, 2020-01-12). web.archive.org
--     (20240203164711) 스냅샷으로 확인 — 'Given Casper's 16% repeat purchase rate ...' 를
--     LTV 계산 입력으로 쓰고 'the S-1 states that repeat customers ...' 로 명시 귀속.
--     16% 는 S-1 수치, 독립 카드 패널 데이터 아님 -> S-1 재작성, 동일 키. (10차 잠정 해소)
UPDATE public.case_evidence SET observation_key='casper-s1-2020', supports_metric=true
 WHERE id='afd7e22e-cdd9-47b6-a28c-4b4c83de4755';

-- ── chwy-10k-fy2023 (4행) ─────────────────────────────────────────────
--   [568c481d] chewy-autoship-retention / PRODUCT_FEATURE (undefined)  primary
--   근거: Chewy 10-K(FYE 2024-01-28, WebFetch 로 문서종류·회계연도 확인). 이 행 스니펫은 Connect with a Vet 서술 - 활성고객당 순매출(434->555) 수치 없음.
UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023', supports_metric=false
 WHERE id='568c481d-0d96-4c96-b5ae-8285e7d07b7e';
--   [110cc0f3] chewy-autoship-retention / PRODUCT_FEATURE (undefined)  primary
--   근거: 같은 10-K. 표 원문 'Net sales per active customer $555 $496 $434'.
UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023', supports_metric=true
 WHERE id='110cc0f3-6a15-4e4e-a4e1-fb27a7fba037';
--   [8d6fcbef] chewy-autoship-retention / PACKAGING (undefined)  secondary
--   근거: Retail Dive(2024-03-21). 본문 'about 76% ... according to newly minted CFO David Reeder' - 회사 공시를 CFO 발언으로 귀속. 10-K 와 동일 관측(L-61). '약 76%' 수치 담김.
UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023', supports_metric=true
 WHERE id='8d6fcbef-1c24-4eb0-99b3-0dbddfa1824b';
--   [4d9abdc6] chewy-autoship-retention / PACKAGING (undefined)  primary
--   근거: 같은 10-K. 표 원문 'Autoship customer sales as a percentage of net sales 76.2 % 73.2 % 70.5 %'.
UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023', supports_metric=true
 WHERE id='4d9abdc6-86a4-4236-83c3-dfe12052ec92';

-- ── cvna-s1-2017 (4행) ────────────────────────────────────────────────
--   [375133fa] carvana-360-imaging-trust / OFFER (undefined)  primary
--   근거: Carvana S-1(2017-03-31). '시장 수 3->21' 는 S-1 본문 표에 있다(cc83cf5b 참조). 이 행 스니펫은 market 정의.
UPDATE public.case_evidence SET observation_key='cvna-s1-2017', supports_metric=true
 WHERE id='375133fa-52da-484e-9906-516197027d08';
--   [494ead5f] carvana-360-imaging-trust / OFFER (undefined)  primary
--   근거: 같은 S-1. retail units sold 정의 스니펫.
UPDATE public.case_evidence SET observation_key='cvna-s1-2017', supports_metric=true
 WHERE id='494ead5f-2511-4528-930c-5a5d3cdc9d04';
--   [d724efa5] carvana-360-imaging-trust / PRODUCT_FEATURE (undefined)  primary
--   근거: S-1 이지만 이 행 스니펫은 360도 이미징 기술 서술 - 판매대수(2105->18761) 수치를 담지 않는다.
UPDATE public.case_evidence SET observation_key='cvna-s1-2017', supports_metric=false
 WHERE id='d724efa5-79cd-4d42-8299-f20242776792';
--   [cc83cf5b] carvana-360-imaging-trust / PRODUCT_FEATURE (undefined)  primary
--   근거: S-1 표 원문: 'Number of markets at period end 3 9 21 Retail units sold 2,105 6,523 18,761'.
UPDATE public.case_evidence SET observation_key='cvna-s1-2017', supports_metric=true
 WHERE id='cc83cf5b-86d3-408d-bfc5-13b0229e77b7';

-- ── dealsite-article-2024 (1행) ───────────────────────────────────────
--   [ce5916e4] beauty-of-joseon / POSITIONING (undefined)  tertiary
--   근거: syncly 는 딜사이트(2024)·뉴스1(2025)·디지털데일리(2024)를 인용하는 애그리게이터. 아마존 선크림 1위 주장은 딜사이트발. tertiary.
UPDATE public.case_evidence SET observation_key='dealsite-article-2024', supports_metric=true
 WHERE id='ce5916e4-fe8c-41d3-a97a-9cc1362d2ff4';

-- ── duol-8k-2023q2 (1행) ──────────────────────────────────────────────
--   [8d29c62b] duolingo-streak / PRODUCT_FEATURE (undefined)  primary
--   근거: Duolingo 8-K Q2 2023. Q2 DAU 2140만명 - 이 무브의 Q4 기준 10->27 을 직접 담지 않는다(다른 분기). 뒷받침 여부 판정 보류 -> NULL.
UPDATE public.case_evidence SET observation_key='duol-8k-2023q2', supports_metric=NULL
 WHERE id='8d29c62b-9a9b-4891-8e63-f883b106911b';

-- ── duol-shareholder-letter-2023q4 (1행) ──────────────────────────────
--   [c47cfd56] duolingo-streak / PRODUCT_FEATURE (undefined)  primary
--   근거: Duolingo IR 릴리스(2024-02-28) '65% DAU Growth ... Q4 2023'. 회사 자기보고 분기 발표. DAU 지표 담김.
UPDATE public.case_evidence SET observation_key='duol-shareholder-letter-2023q4', supports_metric=true
 WHERE id='c47cfd56-8807-47bd-9058-3520ce97bd6e';

-- ── earnest-panel-warby-s1era (1행) ───────────────────────────────────
--   [d24efe41] warby-parker-home-try-on / OFFER (undefined)  secondary
--   근거: Earnest Analytics: 카드 거래 패널로 본 신규/재구매 비중 추이가 S-1 방향과 일치. 회사 밖 독립 측정(is_estimate=true).
UPDATE public.case_evidence SET observation_key='earnest-panel-warby-s1era', supports_metric=true
 WHERE id='d24efe41-4ab4-4318-aec2-938d7e0357aa';

-- ── elf-10k-fy2021 (2행) ──────────────────────────────────────────────
--   [4b9ac117] elf-beauty-awareness-engine / CONTENT (undefined)  primary
--   근거: e.l.f. 10-K FY2021. 'Total expenses for marketing and digital ... $49.7 million, approximately 16% of our net sales'.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2021', supports_metric=true
 WHERE id='4b9ac117-2579-4a31-84ba-3565c77ff8cb';
--   [5c065636] elf-beauty-awareness-engine / POSITIONING (undefined)  primary
--   근거: 10-K FY2021. 'Net sales increased $35.3 million, or 12%, to $318.1 million'.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2021', supports_metric=true
 WHERE id='5c065636-e33c-4233-b4ff-9c4186ec708e';

-- ── elf-10k-fy2024 (4행) ──────────────────────────────────────────────
--   [a2127583] elf-beauty-awareness-engine / CONTENT (undefined)  primary
--   근거: e.l.f. 10-K FY2024. 'Total expenses for marketing and digital ... $256.0 million, approximately 25% of our net sales'.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2024', supports_metric=true
 WHERE id='a2127583-e877-4914-99a5-6151eb005256';
--   [26506d16] elf-beauty-awareness-engine / POSITIONING (undefined)  primary
--   근거: 같은 10-K. 이 행 스니펫은 브랜드 인지도 전략 서술 - 연간 순매출(318.1->1023.9) 수치 없음.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2024', supports_metric=false
 WHERE id='26506d16-b227-4553-8bd0-107ed3127664';
--   [d8254b05] elf-beauty-awareness-engine / POSITIONING (undefined)  primary
--   근거: 같은 10-K. 가격 비교 예시($14 vs $49) - 순매출 수치 없음.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2024', supports_metric=false
 WHERE id='d8254b05-e397-4823-b1b8-cf0dc3498d3c';
--   [065eb790] elf-beauty-awareness-engine / POSITIONING (undefined)  primary
--   근거: 10-K FY2024. 'Net sales increased $445.1 million, or 77%, to $1,023.9 million'.
UPDATE public.case_evidence SET observation_key='elf-10k-fy2024', supports_metric=true
 WHERE id='065eb790-7de0-43d7-bd6a-0bd1a26bc4ad';

-- ── figma-s1-2025 (5행) ───────────────────────────────────────────────
--   [42ffcb12] figma-non-designer-distribution / PRODUCT_FEATURE (undefined)  secondary
--   근거: TechCrunch Figma IPO 기사. 현재 링크 404. 지난 라운드 판정: 회사 숫자를 옮긴 기사, '공시 존재·날짜 확인용' - 수치 뒷받침으로 안 씀.
UPDATE public.case_evidence SET observation_key='figma-s1-2025', supports_metric=false
 WHERE id='42ffcb12-2a08-4bd5-bd52-ff05aa3224dd';
--   [e2010b09] figma-non-designer-distribution / PRODUCT_FEATURE (undefined)  primary
--   근거: Figma S-1(2025-07-01). 'two-thirds of our monthly active users are not designers'.
UPDATE public.case_evidence SET observation_key='figma-s1-2025', supports_metric=true
 WHERE id='e2010b09-de21-4214-ac48-d045e91b0a3a';
--   [d4403676] figma-non-designer-distribution / PACKAGING (undefined)  tertiary
--   근거: mostlymetrics S-1 브레이크다운. 'NDR: 134% in 2024; 132% as of Q1 2025' - S-1 수치 그대로. tertiary.
UPDATE public.case_evidence SET observation_key='figma-s1-2025', supports_metric=true
 WHERE id='d4403676-d52d-4b65-86c6-a86197bfe0f4';
--   [59bebec2] figma-non-designer-distribution / PACKAGING (undefined)  tertiary
--   근거: tomtunguz S-1 분석. 지난 라운드에 132% 가 본문에 있음을 직접 대조. S-1 해설이라 tertiary.
UPDATE public.case_evidence SET observation_key='figma-s1-2025', supports_metric=true
 WHERE id='59bebec2-a364-43f2-a96a-5f302c5e69e9';
--   [2d68117d] figma-non-designer-distribution / PACKAGING (undefined)  primary
--   근거: Figma S-1. 'NDR 132%(2024-12-31 기준 134%)'.
UPDATE public.case_evidence SET observation_key='figma-s1-2025', supports_metric=true
 WHERE id='2d68117d-a58c-45d3-83d2-32acdbd39138';

-- ── goodaiglobal-ceo-interview-2024 (1행) ─────────────────────────────
--   [c2ff198e] beauty-of-joseon / CHANNEL (undefined)  secondary
--   근거: 디지털데일리 천주혁 대표 인터뷰(2024-02). 2020 1억->2021 30억->2022 300억->2023 1400억. 자기보고이고 2024 마감치(3237)가 없다.
UPDATE public.case_evidence SET observation_key='goodaiglobal-ceo-interview-2024', supports_metric=false
 WHERE id='c2ff198e-6086-4c1d-81d6-7556ec393c32';

-- ── goodaiglobal-dart-fy2025 (1행) ────────────────────────────────────
--   [9ac6a7dd] beauty-of-joseon / CHANNEL (undefined)  secondary
--   근거: thebell: 16일 금감원 전자공시 인용, 2025 연결 매출 1.47조. 이 무브의 400->3237(브랜드/2024)과 범위·기간이 다르다.
UPDATE public.case_evidence SET observation_key='goodaiglobal-dart-fy2025', supports_metric=false
 WHERE id='9ac6a7dd-bb54-4c62-a91f-c73e9966eec9';

-- ── goodaiglobal-financials-fy2024 (2행) ──────────────────────────────
--   [c86384f4] beauty-of-joseon / CHANNEL (undefined)  secondary
--   근거: THE VC 재무 페이지 = 구다이글로벌 재무제표 기반. 2023 1394억 -> 2024 3216.8억(뉴스1 3237억과 동일 관측).
UPDATE public.case_evidence SET observation_key='goodaiglobal-financials-fy2024', supports_metric=true
 WHERE id='c86384f4-717c-4e69-b007-18465f731ff1';
--   [68a8fc40] beauty-of-joseon / CHANNEL (undefined)  secondary
--   근거: 뉴스1: 2022 400억 / 2023 1400억 / 2024 3237억 - 이 무브의 metric 시리즈 원 출처. 감사재무 수치와 일치 -> THE VC 와 동일 관측.
UPDATE public.case_evidence SET observation_key='goodaiglobal-financials-fy2024', supports_metric=true
 WHERE id='68a8fc40-e329-4a75-9d61-83a965e892bd';

-- ── kurly-dart-annual-2024 (1행) ──────────────────────────────────────
--   [b38252c9] kurly-unit-economics / OPERATIONS (undefined)  primary
--   근거: 컬리 사업보고서(접수 20250327000672). 연결 포괄손익계산서 'V. 영업손실 (18,329,152,144) ... (233,454,569,905)' = -183억/-2334억. 지난 라운드 원문 대조 완료.
UPDATE public.case_evidence SET observation_key='kurly-dart-annual-2024', supports_metric=true
 WHERE id='b38252c9-665d-4283-b02f-56f45dea3112';

-- ── kurly-preliminary-results-2024 (2행) ──────────────────────────────
--   [f28f4366] kurly-unit-economics / OPERATIONS (undefined)  secondary
--   근거: 연합뉴스(2025-03-05): 컬리 실적발표 잠정치를 매체가 옮김. '영업손실 183억' 담김. is_estimate=true.
UPDATE public.case_evidence SET observation_key='kurly-preliminary-results-2024', supports_metric=true
 WHERE id='f28f4366-6b3c-4b07-913f-36fad76b3776';
--   [16fc4516] kurly-unit-economics / OPERATIONS (undefined)  secondary
--   근거: 매일경제(2025-03-05): 같은 실적발표의 조정 EBITDA 흑자 전환. 연합뉴스와 동일 발표 -> 동일 관측. 조정 EBITDA 는 DART 에 없는 자체 정의 지표(지난 라운드 전문 검색 확인).
UPDATE public.case_evidence SET observation_key='kurly-preliminary-results-2024', supports_metric=true
 WHERE id='16fc4516-fbc6-4f0a-84b4-2ea6abf26ce5';

-- ── notion-blog-2023-template-gallery (1행) ───────────────────────────
--   [4366ec0d] notion-template-gallery / PACKAGING (undefined)  primary
--   근거: notion.com/blog(2023-06-21): '갤러리 템플릿 600개 -> 5000개 이상'. 자기보고 1차(공시 아님).
UPDATE public.case_evidence SET observation_key='notion-blog-2023-template-gallery', supports_metric=true
 WHERE id='4366ec0d-ca86-4956-8166-9630ab83dba1';

-- ── notion-daytona-account (1행) ──────────────────────────────────────
--   [c518b174] notion-template-gallery / COMMUNITY (undefined)  primary
--   근거: daytona.io: Notion 커뮤니티 담당자 회고. '랜딩 페이지에 곧바로 400건 지원'. 자기보고 1차(공시 아님).
UPDATE public.case_evidence SET observation_key='notion-daytona-account', supports_metric=true
 WHERE id='c518b174-a862-44c6-b143-1b7cfe0c6670';

-- ── nu-20f-2022 (5행) ─────────────────────────────────────────────────
--   [22ccd281] nubank-word-of-mouth-acquisition / (case-level)  primary
--   근거: Nubank 20-F(2022 회계연도, WebFetch 로 문서종류 확인). 케이스 단위 근거(case_move_id NULL) - CHECK 상 supports_metric 는 NULL 이어야 한다.
UPDATE public.case_evidence SET observation_key='nu-20f-2022', supports_metric=NULL
 WHERE id='22ccd281-a6d0-4e77-992a-0aff9a96125c';
--   [06d5314f] nubank-word-of-mouth-acquisition / COMMUNITY (undefined)  primary
--   근거: 같은 20-F. 이 행 스니펫은 '80%-90% organically' 조달 비중 - 누적 고객 수(53.9->74.6) 수치 없음.
UPDATE public.case_evidence SET observation_key='nu-20f-2022', supports_metric=false
 WHERE id='06d5314f-aeb3-49c3-9aab-e36928ec93a4';
--   [0b2378c2] nubank-word-of-mouth-acquisition / COMMUNITY (undefined)  primary
--   근거: 같은 20-F. 'We reached 74.6 million customers ... 53.9 million customers as of December 31, 2021'.
UPDATE public.case_evidence SET observation_key='nu-20f-2022', supports_metric=true
 WHERE id='0b2378c2-23ea-4b5c-9efb-104943526acc';
--   [27c83e06] nubank-word-of-mouth-acquisition / PRICING (undefined)  primary
--   근거: 같은 20-F. 'Monthly ARPAC was US$7.8 ... compared to US$4.5' (WebFetch 로 이 문장 직접 확인).
UPDATE public.case_evidence SET observation_key='nu-20f-2022', supports_metric=true
 WHERE id='27c83e06-2ba4-4ae8-bf29-66109de040e6';
--   [a55e191a] nubank-word-of-mouth-acquisition / PRICING (undefined)  primary
--   근거: 같은 20-F. 'cost to serve per active customer remained stable at US$0.8' - ARPAC(4.5->7.8) 수치 아님.
UPDATE public.case_evidence SET observation_key='nu-20f-2022', supports_metric=false
 WHERE id='a55e191a-85a1-4b43-96ed-cf9bfaf043fd';

-- ── oatly-6k-2022q1 (2행) ─────────────────────────────────────────────
--   [e5b49e34] oatly-capacity-overbuild / OPERATIONS (undefined)  primary
--   근거: Oatly 6-K Q1 2022(접수 0001564590-22-017667). 매출총이익률 9.5%(전년 29.9%)와 2,040bp 자체 분해.
UPDATE public.case_evidence SET observation_key='oatly-6k-2022q1', supports_metric=true
 WHERE id='e5b49e34-7600-40d5-85bc-3f1ee32b4d4b';
--   [04e4a709] oatly-capacity-overbuild / OPERATIONS (undefined)  secondary
--   근거: foodbusinessnews: 같은 분기 실적발표를 옮긴 업계지 보도 - 독립 도메인이나 독립 관측 아님(L-64). 6-K 와 동일 키.
UPDATE public.case_evidence SET observation_key='oatly-6k-2022q1', supports_metric=true
 WHERE id='04e4a709-410f-4778-9b7d-e9d7ee8ab266';

-- ── oatly-f1-2021 (2행) ───────────────────────────────────────────────
--   [9576ac4f] oatly-capacity-overbuild / OPERATIONS (undefined)  primary
--   근거: Oatly F-1(2021-04-19). 가동 4곳 + 건설·계획 3곳 = 7. metric(4->7) 담김.
UPDATE public.case_evidence SET observation_key='oatly-f1-2021', supports_metric=true
 WHERE id='9576ac4f-7e2e-4c7e-9f7d-907868bcf3b3';
--   [a03f6c60] oatly-capacity-overbuild / OPERATIONS (undefined)  primary
--   근거: 같은 F-1. 'greatest constraint on our growth has been production capacity' 서술 - 1분기 매출총이익률(29.9->9.5) 수치 없음.
UPDATE public.case_evidence SET observation_key='oatly-f1-2021', supports_metric=false
 WHERE id='a03f6c60-5c0b-4c1e-abcd-b1dfc8111ec0';

-- ── prpl-10k-2018 (2행) ───────────────────────────────────────────────
--   [2a127180] purple-innovation-capacity-scaleup / (case-level)  primary
--   근거: Purple 10-K 2018(2019-03-14). 케이스 단위 근거(case_move_id NULL) - supports_metric NULL.
UPDATE public.case_evidence SET observation_key='prpl-10k-2018', supports_metric=NULL
 WHERE id='2a127180-c5c2-4457-9c27-c9964f538c2a';
--   [73492414] purple-innovation-capacity-scaleup / OPERATIONS (undefined)  primary
--   근거: Purple 10-K 2018. 'gross profit percentage decreased to 39.4% ... from 43.2%' - before 값(39.4) 담김.
UPDATE public.case_evidence SET observation_key='prpl-10k-2018', supports_metric=true
 WHERE id='73492414-6a5a-404a-a6aa-d8589c0432f4';

-- ── prpl-10k-2019 (4행) ───────────────────────────────────────────────
--   [912103ee] purple-innovation-capacity-scaleup / OPERATIONS (undefined)  primary
--   근거: Purple 10-K 2019(2020-03-09). 표 원문 'Equipment $ 19,761 $ 15,465'.
UPDATE public.case_evidence SET observation_key='prpl-10k-2019', supports_metric=true
 WHERE id='912103ee-d825-49f8-aa99-97863268a051';
--   [e85795c9] purple-innovation-capacity-scaleup / OPERATIONS (undefined)  primary
--   근거: 같은 10-K. 'Equipment in progress reflects equipment ... not in service' 정의 - 취득원가(15.465->19.761) 표 수치 아님.
UPDATE public.case_evidence SET observation_key='prpl-10k-2019', supports_metric=false
 WHERE id='e85795c9-365b-42a3-87a4-df44ac191eb4';
--   [1379db3d] purple-innovation-capacity-scaleup / OPERATIONS (undefined)  primary
--   근거: 같은 10-K. 표 원문 'Gross profit 188,971 44.1 112,602 39.4'.
UPDATE public.case_evidence SET observation_key='prpl-10k-2019', supports_metric=true
 WHERE id='1379db3d-70b6-4f53-a55d-2b6dd6cb09ed';
--   [256e84ad] purple-innovation-capacity-scaleup / OPERATIONS (undefined)  primary
--   근거: 같은 10-K. 'The gross profit percentage increased to 44.1% of net revenues in 2019 from 39.4% in 2018'.
UPDATE public.case_evidence SET observation_key='prpl-10k-2019', supports_metric=true
 WHERE id='256e84ad-b2e1-4fb5-874f-1d4e10f379d9';

-- ── pton-10k-fy2022 (4행) ─────────────────────────────────────────────
--   [6a1687df] peloton-owned-manufacturing-exit / OPERATIONS (undefined)  primary
--   근거: Peloton 10-K FY2022(2022-09-07). 이 행 스니펫은 수요 감소·재고 증가 서술 - 충당금 조정액(38.7->224.9) 수치 없음.
UPDATE public.case_evidence SET observation_key='pton-10k-fy2022', supports_metric=false
 WHERE id='6a1687df-0136-4af2-bd98-604ab8e6a20a';
--   [f047e103] peloton-owned-manufacturing-exit / OPERATIONS (undefined)  primary
--   근거: 같은 10-K. 표 원문 'Excess and obsolete inventory reserve adjustments 224.9 38.7 ( 1.2 )'.
UPDATE public.case_evidence SET observation_key='pton-10k-fy2022', supports_metric=true
 WHERE id='f047e103-40a3-4c03-979d-6d8fedff8e8f';
--   [e8b6197e] peloton-owned-manufacturing-exit / PARTNERSHIP (undefined)  primary
--   근거: 같은 10-K. 'On July 12, 2022, we announced we are exiting all owned-manufacturing' 서술 - Output Park 투자액($86.6M) 수치 없음.
UPDATE public.case_evidence SET observation_key='pton-10k-fy2022', supports_metric=false
 WHERE id='e8b6197e-dc83-44ed-8071-87de970e699f';
--   [e1ac4c86] peloton-owned-manufacturing-exit / PARTNERSHIP (undefined)  primary
--   근거: 같은 10-K. 'we had invested approximately $86.6 million to build an industrial building for sale'.
UPDATE public.case_evidence SET observation_key='pton-10k-fy2022', supports_metric=true
 WHERE id='e1ac4c86-9c02-4f48-a18a-070dbdd629cc';

-- ── pton-exit-announcement-2022-07-12 (1행) ───────────────────────────
--   [4262faf0] peloton-owned-manufacturing-exit / PARTNERSHIP (undefined)  secondary
--   근거: CNBC(2022-07-12) 발표 당일 보도. $86.6M 은 회계연도 말 10-K 수치라 발표 당일 기사엔 없다. 원문 문장 미확보(기존 스니펫).
UPDATE public.case_evidence SET observation_key='pton-exit-announcement-2022-07-12', supports_metric=false
 WHERE id='4262faf0-ca0f-4949-8375-8d725ff6dcfd';

-- ── sacra-estimate-liquiddeath-2023 (1행) ─────────────────────────────
--   [c2755050] liquid-death / POSITIONING (undefined)  secondary
--   근거: Sacra 추정: 2021 4500만 -> 2023 2억6300만. 이 무브 metric(45->263) 담김. is_estimate=true.
UPDATE public.case_evidence SET observation_key='sacra-estimate-liquiddeath-2023', supports_metric=true
 WHERE id='c2755050-8548-4970-af3d-738b71ca521f';

-- ── scienceinc-cofounder-2021 (1행) ───────────────────────────────────
--   [1901e2ac] liquid-death / POSITIONING (undefined)  secondary
--   근거: dot.la: 2021년 4500만 달러 기준점의 출처(Science Inc. 공동창업자 발언). before 값 담김. 자기보고.
UPDATE public.case_evidence SET observation_key='scienceinc-cofounder-2021', supports_metric=true
 WHERE id='1901e2ac-47c1-477a-925f-39174ce31fcf';

-- ── sensortower-panel-2023q3 (1행) ────────────────────────────────────
--   [0225b7b2] duolingo-streak / PRODUCT_FEATURE (undefined)  secondary
--   근거: Sensor Tower 자체 패널(2023-11-13, 3Q23). 'Duolingo DAUs ... increased 56% YoY'. 회사 밖 독립 측정이나 is_estimate=true 라 교차확인엔 안 셈.
UPDATE public.case_evidence SET observation_key='sensortower-panel-2023q3', supports_metric=true
 WHERE id='0225b7b2-2a20-45d8-8d07-d2c4ab7b3bb1';

-- ── slack-s1-2019 (3행) ───────────────────────────────────────────────
--   [fc709fc7] slack-bottom-up-conversion / PRICING (undefined)  secondary
--   근거: TechCrunch(2019-04-26): 매출·손실·DAU 보도. NDR(순매출유지율 171->143) 언급 없음(fetch 로 확인). S-1 재작성.
UPDATE public.case_evidence SET observation_key='slack-s1-2019', supports_metric=false
 WHERE id='fc709fc7-4eca-4225-9701-195da717e502';
--   [78c1b20f] slack-bottom-up-conversion / PRICING (undefined)  primary
--   근거: Slack S-1. 순매출유지율 143% 와 3년 추이 171%->152%->143%.
UPDATE public.case_evidence SET observation_key='slack-s1-2019', supports_metric=true
 WHERE id='78c1b20f-8e39-4ba2-a631-f48be28bc14e';
--   [67cec6ae] slack-bottom-up-conversion / PACKAGING (undefined)  primary
--   근거: 같은 S-1. 매출 105.2 -> 220.5 -> 400.6백만 달러.
UPDATE public.case_evidence SET observation_key='slack-s1-2019', supports_metric=true
 WHERE id='67cec6ae-7391-4e62-b20f-032fabf047e8';

-- ── wrby-earnings-2025q2 (2행) ────────────────────────────────────────
--   [7a582a9c] warby-parker-home-try-on / CHANNEL (undefined)  secondary
--   근거: Retail Dive(2025-08-07): 홈 트라이온 종료와 그 근거(대부분 매장 30분 거리) 보도. 활성고객 증가율(9->4.1%) 수치 없음(fetch 로 확인). 실적 콜 재작성.
UPDATE public.case_evidence SET observation_key='wrby-earnings-2025q2', supports_metric=false
 WHERE id='7a582a9c-0c11-4c5b-9ec8-d6b994b307fe';
--   [5c401868] warby-parker-home-try-on / CHANNEL (undefined)  primary
--   근거: Warby 실적발표(2025-08-07). 이 행 스니펫은 재고 상각 문장 - 활성고객 증가율 담김 여부 스니펫만으로 판정 불가 -> NULL.
UPDATE public.case_evidence SET observation_key='wrby-earnings-2025q2', supports_metric=NULL
 WHERE id='5c401868-0e49-4ffb-a22c-ce980415087d';

-- ── wrby-earnings-2026q2 (1행) ────────────────────────────────────────
--   [06a40d4f] warby-parker-home-try-on / CHANNEL (undefined)  primary
--   근거: Warby 실적발표(2026-08-06). '활성고객 2.71백만명·증가율 4.1%' - after 값 담김.
UPDATE public.case_evidence SET observation_key='wrby-earnings-2026q2', supports_metric=true
 WHERE id='06a40d4f-ecf2-4373-816c-dac4223d1f56';

-- ── wrby-s1-2021 (1행) ────────────────────────────────────────────────
--   [0484a126] warby-parker-home-try-on / OFFER (undefined)  primary
--   근거: Warby Parker S-1(2021-08-24). '재구매 고객 비중 2019년 38% -> 2020년 42%'.
UPDATE public.case_evidence SET observation_key='wrby-s1-2021', supports_metric=true
 WHERE id='0484a126-6aec-4644-9072-f98308246212';

-- ── 재확인 실패 / 원 관측 식별 불가 — NULL 유지 (§7.1: NULL 은 "아니다" 가 아니라 "확인 안 함") ──
--   [ae42a448] duolingo-streak / COMMUNITY (undefined)  tertiary  https://www.influencers-time.com/duolingo-streak-society-case-study-20-renewal-lift/
--   influencers-time: '20% renewal lift ... Duolingo reportedly achieved'. 출처 없는 'reportedly', 기준선·기간 불명. 원 관측 식별 불가 -> NULL(§7.1).
--   (observation_key = NULL, supports_metric = NULL — 손대지 않는다)
--   [2b45fb2b] duolingo-streak / PRODUCT_FEATURE (undefined)  tertiary  https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model
--   marishalakhiani substack(2023-03). 2018 둔화->리텐션 전환 서사. 3차 글들의 DAU 1600만->3000만은 공시(1000만->2700만)와 다르다 - 서사만, 수치 안 씀.
UPDATE public.case_evidence SET supports_metric=false WHERE id='2b45fb2b-2f09-4f7d-a3cc-b9baa9b37805';  -- 관측 키는 NULL, 수치 미담김은 확인됨
--   [7004fce2] liquid-death / POSITIONING (undefined)  secondary  https://www.foodbusinessnews.net/articles/22382-liquid-death-valued-at-700-million-in-latest-raise
--   foodbusinessnews: 2022-10 7억 밸류에이션 투자 유치 사실. '매출 수치 자체를 확인해 주지 않는다'(기존 스니펫).
UPDATE public.case_evidence SET supports_metric=false WHERE id='7004fce2-b467-423c-a0a9-1a598dfed05e';  -- 관측 키는 NULL, 수치 미담김은 확인됨
--   [42f17ce4] notion-template-gallery / COMMUNITY (undefined)  tertiary  https://bettermode.com/blog/notion-community-led-growth
--   bettermode 커뮤니티 SaaS 마케팅 글. 앰배서더 구조 서술, 400 수치 재확인 아님. 재작성.
UPDATE public.case_evidence SET supports_metric=false WHERE id='42f17ce4-868a-4dae-8536-6a63d83ebd6d';  -- 관측 키는 NULL, 수치 미담김은 확인됨
--   [842475ae] notion-template-gallery / PACKAGING (undefined)  tertiary  https://foundationinc.co/lab/notion-strategy
--   foundationinc 마케팅 에이전시 해설글. 수치의 독립 확인 아님. 재작성.
UPDATE public.case_evidence SET supports_metric=false WHERE id='842475ae-66f5-4f02-8701-465d410a25e5';  -- 관측 키는 NULL, 수치 미담김은 확인됨

-- 백필 요약: observation_key 67/72 행, supports_metric true 46 · false 20 · NULL 6.
--   (casper 2행이 wayback 확인으로 NULL→casper-s1-2020 으로 옮겨졌다. 파일 상단 참조.)

COMMIT;

-- ============================================================
-- 적용 후 확인 — 2026-09-07 실행 완료 (실측값 기록)
-- ============================================================
--   case-pipeline-verify.mjs --probe   → 양성 21 · 음성 0 · 확인 불가 0 · exit 0
--                                        (관측 키 커버리지 67/72, 수치 뒷받침 66/72)
--   case-review.mjs regrade --dry      → A13·B5·C13·D1 → A12·B0·C19·D1, 바뀐 것 6, 잠정 4
--   case-review.mjs regrade            → 실반영 완료. 재실행 시 바뀐 것 0(멱등).
--   ⚠️ review_status(승인) 는 안 건드렸다 — 6개 강등 무브는 사람이 다시 판단할 자리다.
