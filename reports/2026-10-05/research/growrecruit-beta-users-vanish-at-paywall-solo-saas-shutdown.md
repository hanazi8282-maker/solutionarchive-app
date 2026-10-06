# GrowRecruit — 조사 노트 (실패 사례 할당분, 2026-10-05)

## 대상 선정
- 큐: SaaS 실패·피벗·철수 사례, 대상 미정. 적립된 slug 목록과 겹치지 않는 1인 창업 SaaS 종료 글을 찾았다.
- 후보 중 Voiczy("im shutting down my profitable saas", polder.substack.com)는 원문이 WebFetch 403 이라 **확인 불가** — 검색 스니펫만 있어 수치(고객 11명 등)를 쓰지 못했다. 버렸다.
- 선택: GrowRecruit (독립 헤드헌터용 지원자 관리 CRM, 1인 창업, 2018~2019). 출처 목록은 postmortem.io 색인.

## 찾은 것
- 1인칭 출처 1건 직접 열람: 창업자 Alex Hyett 의 글 https://www.alexhyett.com/lessons-learned-from-failed-startup/ (2020-11-04, 자기보고).
- 사고의 흐름: 타깃 인터뷰·시장 조사로 "시장은 있다"고 판단 → 블로그 글로 베타 사용자 모집 → 유료 벽(베타 할인 포함)을 세우자 이탈 → 돌아보니 헤드헌터는 엑셀로 충분했다 → 저축이 줄며 스트레스 → 2019년 재취업.
- 무브 3개, 전부 `outcome_direction=negative`. 억지 교훈·positive 전환 없음.
- 독자 문제: `NO_FIRST_CUSTOMER` (무료 사용자는 있는데 돈 내는 사람이 없다).

## 못 찾은 것 (확인 불가)
- 가격, 베타 사용자 수, 유료 전환 수, 매출 — 글에 없다. 그래서 수치 필드는 전부 null, 사실확인 등급 D.
- 종료 월 — 글에는 "2019년"뿐. period_end 는 2019-12-31 로 상한만 둔 값이다(월 확인 불가). period_start 2018-01-01 도 "2018년 초"를 날짜로 옮긴 것.
- 현재 상태: 서비스 종료로 보이나 도메인·사이트 생존을 직접 확인하지 않았다. 글 내용(재취업)에 근거해 `shutdown` 으로 적었다 — 사이트 확인은 안 했다.
- 독립된 2차 출처 — 없다. postmortem.io 항목은 같은 글의 색인이라 독립 출처로 세지 않았다(tertiary, 별도 observation_key 이나 같은 원 관측).
- 인용 정확도 주의: 원문은 WebFetch 요약 도구를 통해 읽었다. 스니펫 5개 중 "8 blog posts" 줄은 도구가 "paraphrased" 로 표시했고 생략 부호(...)를 쓴 합성 인용이다 — 승인 전 원문 대조 필요.
- price_band: 가격이 글에 없어 비워 뒀다(validate 경고).

## 어휘 메모
- config/reader-problems.json 의 7개 안에서 맞는 코드가 있었다(NO_FIRST_CUSTOMER).
- 페인 유형 낱말 검사(`config/pain-terms.json`)는 무브 1·2 claim 에 낱말(무료·가입)을 넣어 통과시켰다.
- 이식성(transferability)은 쓰지 않았다(사람이 승인 때 고른다).

## 유사 기적립과의 차이
- baremetrics-intros-verbal-validation-zero-paid(말로만 검증), college-conductor(기술 먼저)와 같은 계열이지만, 여기서 새 것은 "매일 쓰던 무료 베타 사용자가 유료 벽에서 증발"과 "경쟁 상대가 무료 엑셀"이라는 두 지점이다. 겹침이 크다고 판단되면 승인 단계에서 합치거나 버려도 된다.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에 GrowRecruit·리크루팅 CRM 프로젝트가 없다. 모든 무브의 `voc_inputs` 는 비워 뒀다.

## validate
- `node scripts/case-research.mjs validate --slug growrecruit-beta-users-vanish-at-paywall-solo-saas-shutdown` → error 0건, 통과 (경고: price_band 비움, 무브 3개 수치 없음 D).
