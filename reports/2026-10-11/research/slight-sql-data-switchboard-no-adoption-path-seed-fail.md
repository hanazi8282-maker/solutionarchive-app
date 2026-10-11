# Slight — 조사 노트 (2026-10-11, 실패 사례 할당분)

## 선정
- 큐 대상이 "미정"이라 WebSearch 로 직접 골랐다. 후보 중 Voiczy·LeaderBird·Dev Genius "$147 MRR" 글은 Substack/Medium 계열이 403 이라 1인칭 원문을 못 열어 제외(확인 불가). College Conductor(Matt Layman)는 이미 적립돼 제외, Juttu 도 적립돼 제외.
- Slight(공동창업자 2인, B2B SaaS, 2024-10-28 포스트모템)는 창업자 본인 글을 직접 열 수 있었다.

## 찾은 것
- 1인칭 출처 1건 확인: colmanhumphrey.com/posts/why-slight-failed/ (여러 번 열어 같은 인용 재현). 사고의 흐름: 이상 고객=시리즈 B 회사 → 채택 경로 제시 못 함 → 큰 회사는 기업 기능, 작은 회사는 불편이 안 아픔 → 2023 초 시드 시도 시 온보딩 변경의 초점을 고객 확보가 아니라 투자 유치에 둠 → 고객 부족으로 시드 실패. "시장 탓은 핑계" 라고 스스로 결론.
- 제품: 파라미터화된 SQL → 스프레드시트/웹 UI/R·Python SDK/API 로 노출하는 데이터 앱 도구. 2년 반 운영, 프리시드 유치(보조 출처: Wellfound 프로필·검색 요약).

## 못 찾은 것 (확인 불가)
- 가격, 고객 수, 매출, 투자 금액 — 글에 숫자가 없다. 그래서 무브 2건 모두 수치 없음(등급 D). 숫자를 만들지 않았다.
- 창업·종료 정확한 날짜. period_start 는 비웠고 period_end 는 포스트모템 게시일(종료 시점이 아님에 주의).
- price_band — 가격 미공개라 비움(validate 경고).
- 제3자 교차 출처(투자 기사 등) — 못 열었다. 단일 출처·자기보고.
- WebFetch 는 요약 모델을 거치므로 인용 문구는 같은 글을 3회 열어 반복 재현된 것만 snippet 으로 썼으나, 글자 단위 원문 대조는 못 했다.
- 한 번은 HN 요약이 "솔로 창업자·SSO 구축" 같은 글에 없는 내용을 냈다. 그 내용은 전부 버렸다.

## 어휘 메모
- reader_problem: 가장 가까운 NO_CHANNEL 로 골랐으나 정확히는 "채택 경로 설계"다(어휘에 정확히 맞는 코드 없음, 억지 매칭 가능성 있음).
- claim 에 pain-terms("도입")를 넣어야 validate 가 통과했다.
- 이식성 주의: 투자 받은 2인 팀·기업 고객 이야기라 1인 창업가에게 규모 차이가 있다. preconditions 에 명시. 이식성 판정은 사람 몫.

## VOC
- VOC 해당 없음. 색인에 Slight 나 SQL 데이터 도구 프로젝트가 없다(dev.to `saas` 태그 프로젝트는 범용 피드라 무브를 직접 받치지 않아 붙이지 않음). `voc_inputs` 비움.

## 진행 판단 절차 (원칙 §0)
- 검토: 소비재 쏠림 회피, 이미 적립된 slug 중복 확인, 1인칭 출처 확보, 숫자 날조 금지.
- 개선: 처음엔 price_band 를 MID 로 넣었다가 근거 없음을 확인하고 null 로 되돌림. HN 요약이 낸 근거 없는 세부(SSO·솔로)를 제거.
- 남은 약점: 단일 자기보고 출처, 수치 없음 → 사내 참고용(D) 이 정상이다.

## validate
- `node scripts/case-research.mjs validate --slug slight-sql-data-switchboard-no-adoption-path-seed-fail` → error 0건, "전부 통과". 경고 5건(price_band 비움, 수치 없음 D ×2, 부정 사례 D ×2).
