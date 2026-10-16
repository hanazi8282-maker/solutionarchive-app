# v71ad §2 — ② 영업 앱스토어 후보 검증 (2026-10-17)

정본 데이터: `reports/2026-10-17/sales-apps-verified.json`. 등록 마이그: `supabase/migrations/20261017000010_sales_appstore_targets_20261017.sql`(미적용).

## 방법

- 요청: iTunes 공식 API 만. search 이름당 1회(us, 세일즈맵만 kr) 41회 + lookup 일괄 4회(kr·us × 2라운드) = **45회**, 요청 사이 3초. 차단 신호(비 200·빈 응답) 0.
- 판정: `lib/review/anchor.ts` `verifyAnchor` 를 그대로 import 해서 돌렸다 — 이름 일치(첫 토막 + 허용 꼬리말) · 맞는 앱의 판매자 단일 · 평가 ≥ 50 · **판매자 도메인 = 공식 도메인**. 규칙을 고치거나 예외를 두지 않았다.
- 중복: 리포 안 마이그·reports·data 의 앱스토어 ID 52개와 대조해 0건 겹침. DB 는 안 봤다 — 마이그 SQL 이 같은 앱 ID(어느 국가든)·같은 이름 키 프로젝트를 다시 걸러 건너뛴다.
- 소스: 새 소스가 아니다. `appstore`(이미 enabled, 소유자 예외 `owner_2026-10-05`)에 새 **타깃**만 더한다. 약관·법적 라벨은 소스 단위로 이미 승인돼 있다.
- 국가: kr 우선 지시였지만 kr 스토어 평가 수가 19개 중 17개가 0~7건이라 kr 행은 **kr 평가 ≥ 50(앵커 하한과 같은 값)** 인 2개(Salesforce 4,270 · LinkedIn Sales Navigator 244)만 넣었다. 나머지는 us 만. 같은 앱의 gb·ca·au 창문은 이 타깃이 앵커가 되면 nightly-window-discovery 가 하루 5개씩 자동으로 판단한다(이것도 30% 게이트를 쓴다).

## 통과 19개 → 타깃 21행 (평가 수 = 리뷰 규모 대리 지표, 2026-10-17 lookup)

- Salesforce `404249815` · salesforce.com · us 353,847 / kr 4,270 → us+kr
- LinkedIn Sales Navigator `910768078` · business.linkedin.com · us 51,953 / kr 244 → us+kr
- Cloze `596927802` · cloze.com · us 2,835
- Zoho CRM `444908810` · zoho.com · us 2,691
- Keap (Keap Mobile) `1421097870` · keap.com · us 1,827
- SalesRabbit `879884387` · salesrabbit.com · us 1,169
- Badger Maps `789934914` · badgermapping.com · us 1,108
- Bigin by Zoho CRM `1454212098` · zoho.com · us 962
- Pipedrive `921456160` · pipedrive.com · us 675
- Salesmate `1114709439` · salesmate.io · us 632
- Nimble `651636273` · nimble.com · us 619
- Freshsales `1073125057` · freshworks.com · us 523
- Copper `941438829` · copper.com · us 446
- OnePageCRM `692777054` · onepagecrm.com · us 384
- Insightly `563017797` · insightly.com · us 293
- Streak `674067680` · streak.com · us 160
- Nutshell `337938121` · nutshell.com · us 85
- noCRM.io `1079498089` · nocrm.io · us 59
- Close `1668836284` · close.com · us 52 (하한 50 바로 위)

## 탈락 22개와 사유

- 앱 없음(이름 맞는 앱 0): Apollo.io · monday sales CRM(monday CRM 앱은 평가 0) · Capsule CRM(검색 결과에 "Capsule CRM" 이 있으나 평가 44 < 50 이고 이름 변형이 안 맞음) · lemlist · Reply.io · folk · Lusha · Seamless.AI · Vtiger · Teamgate · Pipeline CRM("Pipeline - A Simple CRM" 은 이름 불일치)
- 평가 < 50(실사용 근거 약함): Less Annoying CRM 5 · 세일즈맵 0(kr) · Attio 29 · Agile CRM 33 · Salesflare 9 · EngageBay 4
- 판매자 도메인 불일치(동명 앱 방지 규칙): Zendesk Sell(판매자 Future Simple, getbase.com — Zendesk 가 인수한 Base CRM 의 옛 도메인으로 보이나 규칙상 탈락, 평가 1,567) · SugarCRM(sugarai.com, 76) · SPOTIO(판매자 URL 없음, 324) · Bitrix24(판매자 URL 없음, 1,292) · Dynamics 365 Sales(판매자 URL 없음, 854)

사람이 공식 도메인을 확인해 주면 넣을 수 있는 후보(규칙 탈락이지 가짜 앱은 아님): Zendesk Sell · Bitrix24 · SPOTIO · Dynamics 365 Sales · SugarCRM.

## 프로젝트 방식

- 앱마다 새 `analysis_projects` 1행(② · `area_basis='manual'` · `area_rule_ver='sales-v71ad'`). 게이트로 뽑힌 앱만 만든다.
- 기존 영업 프로젝트에 붙이지 않은 이유: 프로젝트 = 경쟁 제품 1개, 수요축·관련성 판정이 프로젝트 단위라 다른 제품 리뷰를 섞으면 그 프로젝트 수치가 오염되고 되돌리기 어렵다. 2026-10-08 v37(⑤ 10제품)·10-14 후보 등록과 같은 방식이다.
- 참고: `salesforce-agentforce`(CS 영역 hold) 프로젝트가 따로 있지만 앱스토어 타깃은 없다. 이름 키가 달라(`salesforceagentforce`) 충돌하지 않는다.
