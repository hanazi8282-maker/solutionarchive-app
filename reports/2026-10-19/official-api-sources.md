# ⑪ 공식 API 소스 — GitHub Issues · Stack Exchange · YouTube (v71au, 2026-10-19)

라벨: [직접 실행 확인]=오늘 API·DB 호출 · [코드만 확인] · [추정]=계산식 명시. DB 쓰기 없음(마이그는 초안·미적용).

## 요약 (일 기여 — 정직하게)
- 지속 기여는 작다: GitHub 24곳 ≈ 25~35건/일 · YouTube 23영상 ≈ 20~40건/일 · Stack Exchange ≈ 0.2건/일 [추정].
  사용 가능(relevant) 기준 합 ≈ 50~80건/일 = 증분 목표 2,611의 2~3%.
- 일회성은 크다: GitHub 첫 백필 ≤6,000건(relevant 88% → ≈5,100) + YouTube 첫 통독 ≈3,600건(relevant 40~60% [추정] → ≈1,400~2,200).
  약 1주에 걸쳐 평균 +900~1,000건/일(임시). 1주 뒤에는 위 지속 기여로 내려온다 — 이것으로 ×3 를 유지할 수 없다.

## (a) GitHub Issues 24곳 — 마이그 `20261019000010_github_issues_targets_24` + 코드 `REPOS` 24곳 추가
측정(무토큰 Search, 최근 50건, 메인테이너·봇 제외, 사용자 이슈/일) [직접 실행 확인 2026-10-19]:
- ① 회의·통화: bigbluebutton 0.79 · buzz 0.44 · speakr 0.72 · mattermost 0.70
- ② 영업·고객: invoiceninja 1.08 · dolibarr 4.84 · chatwoot 3.17 · zammad 1.97 · odoo 4.45
- ③ 마케팅·분석: umami 0.94 · formbricks 0.57 · matomo 1.02 · novu 0.55 · posthog 5.74
- ④ 인사 운영: leantime 0.54 · ever-gauzy 17.47(2.7일치 폭주)
- ⑤ 글쓰기·문서: logseq 0.63 · outline 1.12 · joplin 1.83 · docmost 0.94 · memos 1.86 · siyuan 32.3(1.4일치 폭주) · zettlr 0.78 · marktext 5.15
- 제외(rate<0.4): monica 0.08 · akaunting 0.06 · plausible 0.09 · mailtrain 0.04 · solidtime 0.14 · timetagger 0.09 · hedgedoc 0.13 · trilium 0.11 · nextcloud/notes 0.22 · scriberr 0.21 · openreplay 0.35 · opencats 0.07 · writefreely 0.12.
  저장소 이름 변경/없음(HTTP 422): calcom/cal.com · horilla · plane · sendportal.
- 정직한 한계: 영역 ①(회의·통화)·④(인사·근태)는 공개 이슈 트래커가 있는 오픈소스가 적다(4곳·2곳). 폭주 중인 siyuan·ever-gauzy·posthog·marktext 는 정상상태가 아니다.
- 요청: 첫 실행 타깃당 5페이지 = 24곳 120요청. 램프 목표 120/일(cap_base 240, 10-18 상향) → 약 1일. min_interval 7초 → 분당 ≤8.6(무토큰 Search 한도 10/분 안).

## (b) Stack Exchange — 마이그 `20261019000030_stackexchange_enable` + 코드 BOARDS 5곳·SITE_WEB workplace
- 40개 (사이트, 태그) 조합의 최근 90일 질문 수 합 = **21건**(하루 0.2건). 1건 이상인 8곳만 등재: su-word 5 · su-outlook 5 · su-teams 2 · su-onenote 2 · wa-google-meet 2 · su-zoom 1 · wa-linkedin 1 · wk-meetings 1 [직접 실행 확인].
  softwarerecs 전 태그(transcription·crm·note-taking·email-marketing·time-tracking·project-management 등 12개) 0건.
- 어댑터는 이미 있다(`lib/review/adapters/stackexchange.ts`, 무키, 한도 300/일 IP). 요청 하루 ≈8. 켜도 ×3 에 기여하지 않는다 — 지시(v71au ⑪)와 비용 0 이 켜는 이유.
- 약관: API 이용 약관 원문(stackoverflow.com/legal/api-terms-of-use, 2026-10-19 읽음) = 출처 표시 의무(화면 노출 앱)·위반 시 접근 종료. 상업 이용 금지 문구 없음. 내부 분석만(quote_policy none). Network ToS 본문은 안 읽음 → tos_status `unverified` 유지.
- 같은 천장이라 전문 검색(`/search/advanced?q=`) 확장은 하지 않았다.

## (c) YouTube — 마이그 `20261019000020_youtube_saas_targets` + 코드 `consumerReasonOf` 수정
**활성 0 원인 진단 [직접 실행 확인]:**
1. 기존 타깃 19개 전부 소비재 영상(이어폰·유산균·정수기·탈모샴푸 등, 프로젝트 area_code=`out-consumer`). 댓글을 끝까지 읽어 `exhausted`(마지막 실행 10-08~10-16). 소진은 정상이다.
2. 램프 `supply_state='short'`(읽을 타깃 부족) — 공급 부족.
3. 판정이 안 되는 이유(미판정 133건이 아니라 9,618건): 두 겹의 의도된 제외. (i) `DEFAULT_EXCLUDED_SOURCES=['youtube']`(relevance-judge-all.ts) (ii) 소비재 태그 `CONSUMER_SOURCES=['youtube']`(남헌 v61 — "영상 19개 전부 소비재"). 유튜브 입력 10,553건 중 10,537건이 소비재 태그, 판정된 것 935건.
**연결 조치:**
- 코드: `consumerReasonOf` — 프로젝트 영역이 ①~⑤·design 이면 유튜브 글도 소비재 소스 규칙에서 뺀다. 영역 없음·hold·out-* 는 종전과 같다(기존 19개 영상은 `out-consumer` 영역 규칙으로 계속 제외). 셀프테스트 갱신(consumer-material 47/0).
- 변수(오케스트레이터): `RELEVANCE_EXCLUDE_SOURCES=none`(제외 소스 해제, 롤백=변수 삭제). 이걸 하면 소비재 태그가 안 붙은 유튜브 16건도 판정 대기열에 들어가지만 비용은 무시할 수준($0.04).
- 영상 선정: YouTube Data API v3 `search.list` 26회 + `videos.list` 26유닛(키 값 출력 없음). 영역별 한/영 질의 26개 → 상위 6개씩 → 댓글 30~6,000 · 2023-06 이후 · `commentCount` 존재(댓글 사용 가능) → 질의당 최대 3 → 댓글 많은 순 23개(합 3,589댓글). 리뷰형 영상은 댓글이 적다(상위 영상 대부분 <60).
**쿼터 예산표 (일 10,000유닛 풀):**
- 정정: 지시문의 "search=100유닛"은 틀렸다. `youtube.ts` 헤더(2026-09-16 공식 문서 확인)대로 `search.list` 는 **10,000유닛 풀과 별개인 하루 100회 버킷**이고 조회형 호출은 1유닛이다. 오늘 search 26회 사용(잔여 ≈74).
- commentThreads.list 1유닛/요청. 소스 상한 `daily_request_cap` 200 → 풀의 2%. 23영상 첫 통독 ≈ 40~60요청 → 상한 안. 램프 목표 100/일.
- 확장 여력: 풀 10,000 중 지금 200 사용. 상한을 올리는 것보다 영상 공급이 병목이다. 영상은 `search.list` 하루 ≤100회로 추가 발굴 가능(영상 발굴 자동화는 하지 않았다 — 사람이 고르는 설계 유지, 필요하면 다음 PR).
**보관 override 유지:** 삭제·만료·갱신 장치를 만들지 않았다.

## 오케스트레이터 할 일 (순서)
1. PR 머지(CI 초록 확인).
2. 마이그 적용 순서: `20261019000010`(GitHub 24) → `20261019000020`(YouTube 23) → `20261019000030`(Stack Exchange). 각 파일 하단 확인 쿼리로 양성 확인.
3. 리포 변수 `RELEVANCE_EXCLUDE_SOURCES=none`.
4. `nightly-review-collect` 를 `workflow_dispatch` 로 1회 실행 → 타깃별 `total_collected`·`review_collection_runs` 로 가동·산출 확인 → 판정 워크플로 1회 → relevant 증가 측정.
5. 24h 뒤 재평가: github 요청당 신규 ≥15 · 차단 0이면 유지.

## 약점
1. 지속 기여 2~3%: ×3 는 일회성 백필로만 일시 달성되고 1주 뒤 내려온다. 지속하려면 공급(새 타깃) 자동 보충이 필요 — 이 3개 소스로는 안 된다.
2. 오픈소스 이슈는 버그 리포트라 T2 관련 비율이 기존 88%로 유지될지 모른다(영역 ①·④는 특히). 첫 판정 뒤 재평가.
3. 유튜브 판정 연결은 v61(소비재 태그) 결정을 영역 기준으로 좁히는 변경이다 — 새 SaaS 영상에서 소비재 댓글이 섞이면 판정 비용이 낭비된다(소량).
