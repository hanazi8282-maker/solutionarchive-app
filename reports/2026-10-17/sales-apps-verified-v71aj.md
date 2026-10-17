# v71aj §4-1 — ② 영업 앱 정식 재검증 (2026-10-17)

## 결론
- 후보 62개(v71ad 41 + v71aj 신규 21; 도메인 불일치 5개는 재확인). 앵커 통과 30 · 탈락 32.
- 등록 마이그(`20261017000010`)에 넣는 앱은 29개, 타깃은 31행이다(us 29 · kr 2). 30% 게이트가 허용하는 만큼만 들어간다.
- 리멤버는 앵커를 통과했지만 등록하지 않았다(영역 판단 보류, 아래).

## 호출 (정책 A)
- /search: v71ad 41회(남헌 인정) + v71aj 26회 = **67 / 하루 상한 100**. /lookup 은 v71ad 4회(인정)뿐이고 v71aj 는 0회다.
- 간격 3초 이상, UA 는 `lib/review/runner.ts` USER_AGENT. 4xx·429·캡차·빈 응답은 **0건**이다.
- 로그: `reports/2026-10-17/itunes-search-log.jsonl`(PR #568).

## 판정 방법
- `verifyAnchor(name, results, { expectedDomain, descriptionDomain: true })` 를 쓴다. 이름 일치, 판매자 단일, 평가 50 이상, 판매자 도메인 = 공식 도메인을 본다.
- 설명 URL 보조(v71aj): 판매자 URL 이 비거나 옛 회사 도메인이면 앱 설명 안의 공식 도메인 **URL** 로 확인한다. 이렇게 통과한 것이 Bitrix24 · Dynamics 365 Sales 2개다.
- v71ad 의 19개는 그날 응답의 판정을 그대로 쓴다(남헌이 확인된 호출로 인정). 다시 호출하지 않았다.

## 통과 → 등록 (29개)
- Pipedrive — 앱 921456160 "Pipedrive – Sales CRM" · 평가 675건
- Zoho CRM — 앱 444908810 "Zoho CRM - Sales & Marketing" · 평가 2691건
- Salesforce — 앱 404249815 "Salesforce" · 평가 353847건
- Freshsales — 앱 1073125057 "Freshsales" · 평가 523건
- Close CRM — 앱 1668836284 "Close CRM" · 평가 52건
- Copper CRM — 앱 941438829 "Copper CRM" · 평가 446건
- Streak — 앱 674067680 "Streak - CRM for Gmail" · 평가 160건
- Insightly CRM — 앱 563017797 "Insightly CRM" · 평가 293건
- Nutshell — 앱 337938121 "Nutshell – Small Business CRM" · 평가 85건
- Bigin by Zoho CRM — 앱 1454212098 "Bigin by Zoho CRM" · 평가 962건
- Keap — 앱 1421097870 "Keap Mobile" · 평가 1827건
- Nimble — 앱 651636273 "Nimble" · 평가 619건
- Badger Maps — 앱 789934914 "Badger Maps: #1 Route Planner" · 평가 1108건
- Bitrix24 — 앱 561683423 "Bitrix24" · 평가 1292건 · 판매자 도메인(없음) 대신 설명 URL 로 bitrix24.com 확인 [설명 URL]
- Dynamics 365 Sales — 앱 1485578688 "Dynamics 365 Sales" · 평가 854건 · 판매자 도메인(없음) 대신 설명 URL 로 microsoft.com 확인 [설명 URL]
- SalesRabbit — 앱 879884387 "SalesRabbit" · 평가 1169건
- OnePageCRM — 앱 692777054 "OnePageCRM - Simple CRM System" · 평가 384건
- Cloze Relationship Management — 앱 596927802 "Cloze Relationship Management" · 평가 2835건
- LinkedIn Sales Navigator — 앱 910768078 "LinkedIn Sales Navigator" · 평가 51953건
- Salesmate — 앱 1114709439 "Salesmate – Sales CRM" · 평가 632건
- noCRM.io — 앱 1079498089 "noCRM.io" · 평가 59건
- Daylite — 앱 965269916 "Daylite - Mail, Calendar, CRM" · 평가 438건 — 입력 도메인 정정(marketcircle.com→daylite.app, 판매자 Marketcircle Inc·판매자 URL daylite.app), 같은 응답 재판정·추가 호출 0
- Covve — 앱 1459654107 "Covve - Business Card Scanner" · 평가 4092건
- Map My Customers — 앱 953610296 "Map My Customers" · 평가 468건
- Repsly — 앱 1629889716 "Repsly" · 평가 106건
- Aircall — 앱 1021338425 "Aircall" · 평가 338건
- JustCall — 앱 1156351688 "JustCall - Cloud Phone System" · 평가 1144건
- ActiveCampaign — 앱 1239908329 "ActiveCampaign" · 평가 1172건
- Zoho SalesIQ — 앱 1094699978 "Zoho SalesIQ - Live Chat App" · 평가 1331건

## 통과했지만 등록 보류
- 리멤버 — 앱 840553277 "리멤버 - No.1 경력채용, 명함관리, 커뮤니티" · 평가 84706건 — ⚠️ 앵커는 통과했지만 영역 판단 보류 — 앱 제목이 "경력채용·명함관리·커뮤니티"로 채용 리뷰가 섞일 가능성이 크다(평가 84,706). 사람 판단.

## 탈락 (32개)
- Apollo.io — 이름이 맞는 앱 없음(조회 7건)
- monday sales CRM — 이름이 맞는 앱 없음(조회 8건)
- Zendesk Sell — 이름은 맞지만 판매자 도메인(getbase.com) ≠ 후보 도메인(zendesk.com) — 동명 앱 가능성
- Less Annoying CRM — 이름은 맞지만 평가 5건 < 50(실사용 근거 약함)
- Capsule — 이름이 맞는 앱 없음(조회 8건) — 첫 변형(Capsule) 기준. 두 번째 변형(Capsule CRM)은 앱 660292932 평가 44 < 50 으로 역시 no_match
- 세일즈맵 — 이름은 맞지만 평가 0건 < 50(실사용 근거 약함)
- lemlist — 이름이 맞는 앱 없음(조회 1건)
- Reply.io — 이름이 맞는 앱 없음(조회 8건)
- Attio — 이름은 맞지만 평가 29건 < 50(실사용 근거 약함)
- folk — 이름이 맞는 앱 없음(조회 7건)
- Agile CRM — 이름은 맞지만 평가 33건 < 50(실사용 근거 약함)
- Salesflare — 이름은 맞지만 평가 9건 < 50(실사용 근거 약함)
- SPOTIO — 이름은 맞지만 판매자 도메인(없음) ≠ 후보 도메인(spotio.com) — 동명 앱 가능성
- Lusha — 이름이 맞는 앱 없음(조회 5건)
- Seamless.AI — 이름이 맞는 앱 없음(조회 8건)
- SugarCRM — 이름은 맞지만 판매자 도메인(sugarai.com) ≠ 후보 도메인(sugarcrm.com) — 동명 앱 가능성
- Vtiger — 이름이 맞는 앱 없음(조회 7건)
- EngageBay — 이름은 맞지만 평가 4건 < 50(실사용 근거 약함)
- Teamgate — 이름이 맞는 앱 없음(조회 8건)
- Pipeline CRM — 이름이 맞는 앱 없음(조회 8건)
- Kommo — 이름은 맞지만 평가 12건 < 50(실사용 근거 약함)
- Pipeliner CRM — 이름이 맞는 앱 없음(조회 5건)
- Apptivo — 이름이 맞는 앱 없음(조회 1건)
- Teamleader Focus — 이름은 맞지만 평가 0건 < 50(실사용 근거 약함)
- CamCard — 이름이 맞는 앱 없음(조회 7건)
- Vymo — 이름은 맞지만 판매자 도메인(없음) ≠ 후보 도메인(vymo.com) — 동명 앱 가능성
- Contacts+ — 이름이 맞는 앱 2개가 서로 다른 판매자(fullcontactinc, appleinc)
- Maximizer CRM — 이름이 맞는 앱 없음(조회 7건)
- Agendor — 이름은 맞지만 평가 3건 < 50(실사용 근거 약함)
- RD Station CRM — 이름은 맞지만 평가 4건 < 50(실사용 근거 약함)
- Sellsy — 이름이 맞는 앱 없음(조회 2건)
- LeadSquared — 이름이 맞는 앱 없음(조회 7건)

## 도메인 불일치 5개 재확인
- Bitrix24: 판매자 URL 이 없다. 설명에 bitrix24.com URL 이 있어 **통과**했다(판매자 Bitrix, Inc.).
- Dynamics 365 Sales: 판매자 URL 이 없다. 설명에 microsoft.com URL 이 있어 **통과**했다(판매자 Microsoft Corporation).
- Zendesk Sell: 판매자는 Future Simple(getbase.com, 옛 Base CRM)이다. 설명에 zendesk.com URL 이 없어 **보류**를 유지한다.
- SPOTIO: 판매자 Spotio Inc, 판매자 URL 이 없다. 설명에도 spotio.com URL 이 없어 **보류**를 유지한다.
- SugarCRM: 판매자 이름은 SugarCRM 인데 URL 이 sugarai.com 이다. 설명에 sugarcrm.com URL 이 없어 **보류**를 유지한다. 평가는 76이다. 판매자 이름이 맞으니 sugarai.com 을 공식 도메인으로 볼지는 사람이 판단한다.
