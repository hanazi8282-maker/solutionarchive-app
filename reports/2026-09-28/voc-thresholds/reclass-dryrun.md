# VOC 개수 기준 변경 — 재분류 드라이런 (2026-09-28)

남헌 확정: 정상 = **200 이상 50,000 미만**. 200 미만 = inefficient, 50,000 이상 = oversize.
옛 기준: 30 이상 500 이하.

이 문서는 SELECT 만으로 만든 드라이런이다. DB 는 한 행도 바꾸지 않았다.
UPDATE 초안은 `dryrun-update.sql`, 되돌리기는 `rollback.sql` (둘 다 미실행).

## 이 기준이 걸리는 곳

- 판정 로직: `lib/discovery/candidate.ts` `judge()` — 프로브 hits 로 채택 여부를 정한다.
- 판정이 저장되는 곳: **`discovery_candidates` 한 테이블뿐**(`probe_hits` · `verdict` · `verdict_reason`).
  `information_schema` 에서 hits·voc 이름이 붙은 컬럼은 이 테이블에만 있다.
- `analysis_projects` 에는 판정 컬럼이 없다. 이 기준으로 걸러진 적이 없고, 수집된 행 수
  (`analysis_inputs` count)는 프로브 hits 와 다른 값이다(수집 상한·기간에 좌우). 참고용으로 부록에 적는다.

## discovery_candidates 40건

기존판정 = 옛 기준(30~500)을 지금 hits 로 다시 계산한 값. DB 의 verdict 는 따로 적었다
(오랄비는 상한이 생기기 전에 accepted 로 들어가 DB 와 재계산 값이 다르다).

| ID | 이름 | 축 | VOC | DB verdict / 사람판정 | 기존판정 | 새판정 |
|---|---|---|---|---|---|---|
| 5cee5385 | 필립스 에어프라이어 XXL | physical | 93 | accepted / kept | 정상 | inefficient |
| 3c2268d0 | Notion | saas | 79077 | rejected / pending | oversize | oversize |
| f60410c0 | Datadog | saas | 3576 | rejected / pending | oversize | 정상 |
| 963b08e8 | 오랄비 전동칫솔 | physical | 999+ | accepted / kept | oversize | unverified |
| 89cc8533 | 삼성 비스포크 제트봇 콤보 로봇청소기 | physical | 0 | rejected / pending | inefficient | inefficient |
| 1ad57af4 | 바디프랜드 파라오 안마의자 | physical | 141 | accepted / pending | 정상 | inefficient |
| b8180fad | 1Password | saas | 12129 | rejected / pending | oversize | 정상 |
| 636a50c7 | Figma | saas | 10555 | rejected / pending | oversize | 정상 |
| bfe58169 | 코웨이 정수기 | physical | 31 | accepted / pending | 정상 | inefficient |
| 348f410f | 스토케 익스플로리 유모차 | physical | 60 | accepted / pending | 정상 | inefficient |
| b1552532 | Stripe | saas | 38548 | rejected / pending | oversize | 정상 |
| 3affe536 | Slack | saas | 73041 | rejected / pending | oversize | oversize |
| cbfbd895 | Plausible Analytics | saas | 168 | accepted / pending | 정상 | inefficient |
| 6fd37303 | Carrd | saas | 191 | accepted / pending | 정상 | inefficient |
| 91058ff7 | ConvertKit | saas | 252 | accepted / pending | 정상 | 정상 |
| 8518082d | Basecamp | saas | 6330 | rejected / pending | oversize | 정상 |
| 80c50014 | Gumroad | saas | 2212 | rejected / pending | oversize | 정상 |
| 3f473173 | Postmark | saas | 862 | rejected / pending | oversize | 정상 |
| 58c67094 | Baremetrics | saas | 343 | accepted / pending | 정상 | 정상 |
| 953000e0 | Help Scout | saas | 61 | accepted / kept | 정상 | inefficient |
| a95ca078 | Cal.com | saas | 320 | accepted / pending | 정상 | 정상 |
| 23fd0bc1 | Sentry | saas | 4011 | rejected / pending | oversize | 정상 |
| a9289caa | Ghost | saas | 18910 | rejected / pending | oversize | 정상 |
| a29d740e | Buffer | saas | 45354 | rejected / pending | oversize | 정상 |
| a786c486 | Lemon Squeezy | saas | 103 | accepted / pending | 정상 | inefficient |
| d5ba81f1 | PostHog | saas | 1025 | rejected / pending | oversize | 정상 |
| 7e9fcbf7 | Roam Research | saas | 364 | accepted / pending | 정상 | 정상 |
| d6aac483 | Toggl Track | saas | 12 | rejected / pending | inefficient | inefficient |
| d0967a8e | Loom | saas | 4559 | rejected / pending | oversize | 정상 |
| 4d192f6e | Typeform | saas | 743 | rejected / pending | oversize | 정상 |
| b7e5ff9a | Linear | saas | 72107 | rejected / killed | oversize | oversize |
| d8472872 | Fly.io | saas | 3599 | rejected / killed | oversize | 정상 |
| 9de5961d | Superhuman | saas | 5876 | rejected / killed | oversize | 정상 |
| 0ecebde2 | Metabase | saas | 1131 | rejected / killed | oversize | 정상 |
| 4f2a3e18 | Retool | saas | 2415 | rejected / killed | oversize | 정상 |
| cf36d71c | Tailscale | saas | 9204 | rejected / killed | oversize | 정상 |
| 824ebbcf | Transistor.fm | saas | 135 | accepted / kept | 정상 | inefficient |
| 7f8d059e | UptimeRobot | saas | 168 | accepted / kept | 정상 | inefficient |
| 918c76c0 | Fathom Video | saas | 0 | rejected / kept | inefficient | inefficient |
| a2b8dfb8 | Pinboard | saas | 4015 | rejected / kept | oversize | 정상 |

### 요약

- 전체 40
- 기존: 정상 14 · oversize 23 · inefficient 3
- 새: 정상 23 · oversize 3 · inefficient 13 · unverified 1(오랄비 999+)

### 새로 살아나는 후보 19 (기존 oversize → 새 정상)

Postmark 862 · Typeform 743 · PostHog 1,025 · Metabase 1,131 · Gumroad 2,212 · Retool 2,415 ·
Datadog 3,576 · Fly.io 3,599 · Sentry 4,011 · Pinboard 4,015 · Loom 4,559 · Superhuman 5,876 ·
Basecamp 6,330 · Tailscale 9,204 · Figma 10,555 · 1Password 12,129 · Ghost 18,910 · Stripe 38,548 ·
Buffer 45,354

- 전부 saas. 이 중 5건(Fly.io·Superhuman·Metabase·Retool·Tailscale)은 사람이 이미 killed 로 판정했다.
- 전부 `project_id` 가 없다. verdict 만 accepted 로 바꿔서는 수집이 붙지 않는다 — 등록 경로를 따로 밟아야 한다.
  그리고 `screen()` 이 이미 아는 이름은 already_known 으로 막으므로, 발굴 크론이 이들을 다시 제안해도 재등록되지 않는다.

### 새로 걸러지는 후보 10 (기존 정상 → 새 inefficient)

필립스 에어프라이어 XXL 93 · 코웨이 정수기 31 · 스토케 익스플로리 유모차 60 · 바디프랜드 파라오 안마의자 141 ·
Help Scout 61 · Lemon Squeezy 103 · Transistor.fm 135 · Plausible Analytics 168 · UptimeRobot 168 · Carrd 191

- 전부 `project_id` 가 있다(이미 수집·일부 extract 됨). verdict 를 rejected 로 바꿔도 프로젝트·수집 데이터는 남는다.
- 이 중 4건(필립스·Help Scout·Transistor.fm·UptimeRobot)은 사람이 kept 로 판정했다.

### 별도: 오랄비 전동칫솔 (999+)

- 다나와 캡 값이라 [999, ∞). 새 상한 50,000 을 넘는지 알 수 없어 unverified.
- CHECK `unverified_has_no_project` 때문에 project_id 가 있는 이 행은 unverified 로 못 바꾼다. UPDATE 초안에서 뺐다.

## 부록 — analysis_projects 44건 (판정 컬럼 없음, 참고)

VOC 개수 = `analysis_inputs` 행 수. 이 기준이 적용된 적은 없다.

- 옛 기준(30~500) 으로 셌다면: 정상 15 · oversize 14 · inefficient 15
- 새 기준: 정상 20 · oversize 0 · inefficient 24
- 옛 oversize → 새 정상 14: SONY 4,070 · QCY 3,224 · CJ웰케어 3,159 · SaaS 페인 ONE_OFF 2,381 · NO_CHANNEL 2,043 ·
  돈으로 바꾸는 법 1,753 · 한계 1,721 · NO_FIRST 1,499 · 코웨이 정수기 1,349 · PRICE 919 · TS 샴푸 779 · 오랄비 765 ·
  NOBODY_T 588 · 바디프랜드 509
- 옛 정상 → 새 inefficient 9: UptimeRobot 172 · ConvertKit 153 · Transistor.fm 134 · 닥터포헤어 127 · 필립스 93 ·
  려 자양윤모 92 · 스토케 75 · 비에날씬 73 · Help Scout 41
