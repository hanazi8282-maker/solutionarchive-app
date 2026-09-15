# 조사 노트 — Zapier / DISTRIBUTION (coverage_gap)

- slug: `zapier-integration-page-seo-distribution`
- 큐 사유: coverage_gap — DISTRIBUTION 승인 케이스 0곳, 매칭 성립에 3곳 필요
- 대상은 "미정"이라 WebSearch 로 직접 정함. 이미 적립된 slug 33개(figma-non-designer-distribution,
  quibi-distribution-channel-collapse, notion-template-gallery 등)와 겹치지 않는
  성공 사례로 Zapier 의 프로그래매틱 SEO 연동 페이지 전략을 선택.

## 독자 축 (앞에 온다)

- **reader_problem = NO_CHANNEL** (팔 통로가 없다). Zapier 는 "물건은 있는데 어디에
  내놓을지 모른다"는 상황에서, 유료 고객이 붙기도 전에 검색 유입 경로 자체를
  먼저 지어 둔 사례라 이 코드가 맞다고 판단. 어휘집(`config/reader-problems.json`)에
  더 정확한 코드는 없음 — 억지로 끼워 맞추지 않았다.
- **transfer_note (무브별 1줄)**
  - 무브 0(CHANNEL): "내일, 자주 같이 쓰이는 다른 도구·서비스 5개를 적고 각각
    '[내 제품]과 [그 도구]를 함께 쓰는 법' 페이지 1개씩을 올려라."
  - 무브 1(PARTNERSHIP): "내일, 방금 만든 연동/협업 페이지 링크를 상대 파트너
    담당자에게 보내 자기 채널에도 한 줄 언급해달라고 요청하라."

## 병목·무브

- 병목: DISTRIBUTION (지정값 그대로 사용)
- 무브 수: 2건
  - 무브 0 `CHANNEL` — 등급 [A] (독자 인사이트 축) / 사실확인 참고 C (자기보고 1차뿐,
    다른 원 관측 없음). 근거: 지원 앱 수 2개(2011)→6,000개 이상(2023, First Round
    Review 팟캐스트에서 언급).
  - 무브 1 `PARTNERSHIP` — 등급 [C] (독자 인사이트 축) / 사실확인 D (수치 없음,
    서술만). 파트너 상호 홍보 + 2012년 개발자 플랫폼 서술.

## 사고의 흐름(3.5) — 1인칭 출처 확인

**확인됨.** First Round Review 팟캐스트(2023-10-05 발행, 직접 WebFetch 로 열람)에서
Wade Foster(공동창업자·CEO) 본인이 말한 관찰→추론→결정 순서:
1. 관찰 — "연동"을 검색하면 결과가 죄다 부실한 페이지였고, 포럼에서 특정 앱
   조합 연동 요청이 반복됨.
2. 추론 — Patrick McKenzie 의 Bingo Card Creator(변형마다 페이지를 찍어 검색
   유입을 받는 방식)를 보고 "연동도 검색어 조합이 다양하니 같은 논리가 통한다"고
   판단.
3. 결정 — 첫 유료 고객이 붙기 전에 지원 앱마다 랜딩페이지를 두는 앱 디렉토리를
   먼저 만듦.

## 근거 4건 — 4축 분리

| # | URL | tier | self_reported | estimate | observation_key |
|---|---|---|---|---|---|
| 0 | review.firstround.com (podcast) | primary | true | false | zapier-firstround-wade-foster-podcast-2023 |
| 1 | research.contrary.com (Groove HQ 인터뷰 재인용) | secondary | true | false | zapier-groovehq-wade-foster-interview-2015 |
| 2 | review.firstround.com (podcast, 같은 원 관측) | primary | true | false | zapier-firstround-wade-foster-podcast-2023 |
| 3 | magicspace.agency (SEO 대행사 케이스스터디) | tertiary | false | **true** | (미기재) |

- 근거 0·2 는 같은 팟캐스트 = 같은 원 관측이라 `observation_key` 를 동일하게 묶었다.
- 근거 1 은 Groove HQ 원문(2015년경 "How Zapier Went From Zero to 600,000+ Users in
  Just Three Years")을 Contrary Research 가 인용한 것 — **원문 직접 열람은 실패**
  (`groovehq.com/blog/zapier-interview-with-wade-foster` → 308 리다이렉트 →
  `helply.com/...` → 404. Wayback Machine 은 이 환경에서 접근 자체가 차단됨).
  그래서 `source_tier` 를 secondary 로 낮춰 적었다 — 확인 실패를 primary 로 접지 않았다.
- 근거 3(magicspace.agency, "5,000+ 앱 프로필 페이지가 오가닉 트래픽의 약 15%,
  월 23.5만 방문")은 공식 Zapier 공시가 아니고 날짜도 최초 작성일 불명(마지막
  수정 2024-12-04만 확인)이라 `is_estimate=true`, `observation_key` 미기재로
  두고 **어떤 무브의 수치도 뒷받침하지 않게** 처리했다 — 케이스 배경 이해용 인용.

## 못 찾은 것 (빈칸으로 두지 않고 명시)

- **Groove HQ 원문 발행일 확인 불가.** 위 경로로 직접 열람 실패, Contrary 페이지에도
  날짜가 없었다. `published_at` 을 비워 두고 validate 경고로 남겼다(억지로 채우지 않음).
- **"235,000 월 방문/15% 오가닉 트래픽" 수치의 1차 출처(Zapier 자체 공시) 확인 불가.**
  SEO 대행사 3차 추정만 확보. Zapier 가 이 수치를 공식적으로 밝힌 자료는 찾지 못했다.
- **"100,000 users by end of 2012", "600K customers by 2015"** 등 여러 통계
  블로그(sqmagazine, lefthook, taptwicedigital 등)에 반복되는 숫자들의 원 출처를
  교차 확인하지 못했다 — 전부 같은 3차 집계 사이트를 서로 베낀 것으로 보여
  독립 근거로 세지 않고 초안에 넣지 않았다.
- **현재(2026-09) 시점에 이 SEO 채널이 여전히 Zapier 매출에서 같은 비중을 차지하는지**는
  확인하지 못했다. `outcome_status='active'`(회사 존속)는 확인했지만, 이 무브
  자체가 "지금도 주력 채널"이라는 뜻은 아니다 — 초안 `summary` 에 "2026년 현재도
  핵심 오가닉 획득 채널로 운영 중"이라 썼는데, 이건 회사가 여전히 앱 디렉토리
  구조를 운영 중이라는 관찰(zapier.com/developer-platform 이 9,000개 통합을
  홍보 중인 것)에 근거한 것이지, 트래픽 비중을 재확인한 것은 아니다. 과장이면
  검수 단계에서 이 문장을 낮춰야 한다.
- **이식성(transferability)**: 조사원이 판정하지 않음(원칙대로 필드 비움). 사람
  승인 단계에서 결정.

## validate 결과

```
node scripts/case-research.mjs validate --slug zapier-integration-page-seo-distribution
검증 대상 1건 · error 0건
✅ 전부 통과
```
경고 2건(둘 다 예상된 것): evidence[1] published_at 미기재(확인 불가), moves[1]
수치 없음(등급 D, 서술만).
