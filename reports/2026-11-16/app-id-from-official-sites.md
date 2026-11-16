# 인사·영업 앱 타깃 보충 — 공식 사이트 링크에서 뽑은 앱 ID (v71cp, 2026-11-16)

방법: 후보 제품 공식 사이트 첫 화면(robots.txt 에서 `/` 허용 확인, 못 읽으면 건너뜀)의 Google Play·App Store 링크에서 ID 추출. 스토어 이름 검색은 쓰지 않았다.
같은 회사 대조: Play 상세 페이지(robots 에서 /store/apps/details 허용 확인)의 앱 이름·개발자가 제품과 일치 + 같은 프로젝트의 기존 App Store ID 와 짝이 맞음. When I Work iOS 는 itunes lookup(ID 조회)으로 판매자 확인.

## 등재 13건 (review_targets INSERT, 전부 status=active)
- googleplay: Streak com.mobile.streak · Aircall com.aircall · Bitrix24 com.bitrix24.android · Cloze com.cloze.app · Copper com.prosperworks.android · Covve com.covve.businesscardscanner(개발자 Covve Visual Network) · JustCall com.saaslabs.justcall(개발자 SaaS Labs US) · Nutshell com.nutshell.crm · OnePageCRM com.onepagecrm · Salesmate com.rapidops.salesmate(개발자 RapidOps) · SalesRabbit com.salesrabbit.android.sales.universal · When I Work com.thisclicks.wiw
- appstore: When I Work us:383126470
- 롤백(삭제 훅 때문에 DELETE 대신): `update review_targets set status='exhausted' where id in (4fd13d3b-7fb8-44ab-b198-abf4ebfb3a50, b97df9a8-c4fc-4239-b1d7-dc473eea4229, b993a639-f2e5-4cab-a159-b29dfd04c1ca, 6c7456bc-cfab-4608-bb71-1286f85b1e57, 071241c0-d29e-4f9f-a3dc-c069b08f445d, d384f39d-0acd-4205-acf2-a0143d49edd0, 16f3852d-3b4b-4513-a038-8a4f8872ebff, 9925a1d0-39e6-4954-bfd6-846703ce8c68, b4aec330-2ecc-49d1-8045-dd74b1abf098, 59f5aae9-e7ba-4313-9e8e-248cd19cfb44, f85981c8-e435-40e9-9df7-c317d7c88a9f, 53d59399-bfb9-4585-9a89-144f7318ab50, 96ca4f59-b46c-4ce4-8cbf-78e47f583b67)`

## 넣지 않은 것(불확실·못 찾음) — 목록
- 링크를 못 찾음: BambooHR · Small Improvements · Lighthouse · Mixmax · Pipedrive · ActiveCampaign · Badger Maps · Close · Insightly · Keap · Map My Customers · noCRM · Repsly · Zoho CRM(첫 화면에 스토어 링크 없음 — 모바일 링크가 다른 페이지에 있을 수 있음)
- robots 미확인: Freshsales(freshworks.com) · Nimble
- HubSpot: com.hubspot.android 는 맞지만 HubSpot 프로젝트에 이미 googleplay 타깃이 있어 추가하지 않음.
- 오픈소스 HR·영업 저장소: 앱 없음(월 2건 이하, 이전 판정 유지).
