# 수집 다양화 점검 — v71cp §2 (2026-11-16, CC 실측)

출처: Supabase `review_collection_runs`·`review_targets`·`analysis_inputs`·`v_input_area_effective`(7일 = 11/9~11/16 KST), `scripts/target-revive.mjs --auto --dry`(쓰기 없음).

## 1. 한 줄 결론
- 상위 3곳(appstore·hackernews·googleplay) 비중은 **85.4%**(14,715건 / 7일 약 17,250건). 7일 목표 70% 이하는 **미달**이고 오늘 하루에 못 맞춘다.
- 더 큰 문제: 영역 안(1~5·design) 글만 세면 상위 3곳이 약 **95%**다. 한국 커뮤니티·포럼은 영역 안 비율이 **0%**(전부 out-consumer/out-founder)라, 그쪽을 늘려도 "쓸 수 있는 정보"는 늘지 않는다.
- 켜졌지만 0건인 소스는 고장이 아니라 **타깃이 소진(exhausted)된 상태**다. 되살리기 시계가 `expected_low`(과거 수확 거의 0)로 계속 건너뛴다.

## 2. 소스별 비중(7일, 영역 안 비율 = "쓸 수 있는 정보" 대리지표)
- appstore: 8,038건 · 46.6% · 영역 안 71.0%
- hackernews: 5,495건 · 31.9% · 영역 안 62.5%
- googleplay: 1,182건 · 6.9% · 영역 안 53.0%
- okky: 669건 · 3.9% · 영역 안 0%
- github_issues: 528건 · 3.1% · 영역 안 100%
- clien 361 · devto 231 · disquiet 187 · bobaedream 168 · n8n 134 · bubble 103 · make 68 — 전부 영역 안 0%
- 해석: 영역 안 100%인 곳은 github_issues 뿐인데 타깃 40개가 전부 active이고 7일 528건이다. 여기가 가장 싸게 늘릴 수 있는 자리다(타깃 확대).

## 3. 켜졌지만 7일 0건 소스 — 원인표 (한 줄씩)
- brunch: 타깃 7 전부 exhausted, 마지막 실행 10/21. 원인=타깃 소진(expected_low 7). 조치=새 게시판·키워드 URL 발굴 필요(연료 "긴급").
- yozm: 타깃 1 exhausted. 원인=타깃 소진. 조치=새 URL 발굴.
- damoang: 타깃 3 exhausted. 원인=타깃 소진(expected_low 3). 조치=새 게시판 발굴.
- theqoo: 타깃 4 exhausted. 원인=타깃 소진 + robots 미확인(unverified). 조치=robots 확인 뒤 판단(확인 불가면 가지 않음).
- fmkorea: 타깃 5 전부 failed, 마지막 실행 10/21. 원인=타깃 고장(failed). 조치=원인 로그 확인 뒤 정리 또는 교체(우회 금지).
- 82cook: 타깃 9 exhausted, 마지막 11/06. 원인=타깃 소진(expected_low 8). 다음 자격 11/20. 조치=새 게시판 발굴.
- danawa: 타깃 17 exhausted. 원인=공급 제외(`SUPPLY_EXCLUDED`, 남헌이 09-27 속도 최소화 지정). 조치=없음(남헌 결정 유지).
- tumblbug: 타깃 1 exhausted. 원인=소진, 약관 금지 조항 + 소유자 예외. 조치=유지(대량 보충 안 함).
- kakao_cafe: 타깃 4 exhausted(11/12 마지막). 원인=소진 + 약관 prohibited(소유자 예외). 조치=유지.
- kakao_blog: 타깃 4 exhausted(11/10 마지막). 원인=소진 + 약관 prohibited(소유자 예외). 조치=유지.
- itunes_search: 타깃 0행, 한 번도 안 돎. 원인=일감 없음 + robots disallowed(소유자 예외 10/18). 조치=타깃 등록 여부는 이름 검색 robots 금지 이력(PR #559)이 있어 사람 판단 보류.
- wordpress_org: 타깃 9 exhausted(11/14 마지막). 원인=소진, 다음 자격 11/19. 조치=대기.
- retool_community / glide_community: 7일 5·2건. 원인=게시판 활동량이 적음(정상). 조치=없음.
- youtube: 활성 타깃 0(42 exhausted, 다음 자격 오늘 05:48 UTC). 원인=타깃 소진(소비형). 조치=시계가 곧 되살림, 새 검색어 보충은 별도.

## 4. 되살리기 시계 실측(오늘 dry-run)
- 증분형 후보 318 → 실제 되살림 2. 건너뜀 사유: expected_low 165 · revisit_not_due 115 · queue_full 32 · source_disabled_or_missing 4.
- 연료계: 이상 25곳, 긴급 12곳(82cook·brunch·damoang·fmkorea·itunes_search·kakao_blog·kakao_cafe·theqoo·tumblbug·wordpress_org·youtube·yozm).
- 뜻: 시계 자체는 정상이다. 막힌 건 "새 일감을 만들어 내는 쪽"(새 게시판·URL 발굴)이다.

## 5. appstore 차단 판정
- 최근 6일 차단 응답은 하루 0~2건이고 같은 날 수집은 계속됐다(11/14 2,660건 · 11/15 233건 · 11/16 2,131건). "3일 연속 차단"은 하루 1~2건씩의 부분 차단이다.
- 결정: **켠 채로 유지**. 우회는 하지 않는다. 기존 램프의 안전 되돌리기·soft-skip 이 이미 차단 신호를 받는다. 차단 응답이 하루 5건 이상이거나 수집 0건 + 차단이면 그때 끈다(기록 위치: 이 문서 + 일일 로그).
- googleplay: 11/15 차단 1건, 같은 날 320건 수집. 유지.

## 6. 뉴스레터 DB 적재 — 처리함
- 확인: 원본(`_ground/newsletters`, 8,863편)만 있고 DB 3개 표는 0행이었다. 즉 "수집 완료"는 ground 파일 기준이었다.
- 조치: `scripts/ingest-newsletters.mjs` 로 **free 티어 8,524편만** `newsletter_items` 적재(saastr 7,839 · trends.vc 424 · lenny 135 · saasplaybook 126). 유료 티저 339편은 제외. 본문은 DB 에 넣지 않았다(summary NULL, 제목·URL·날짜·해시만). 발신자 라벨 4개 등록.
- 아직 안 한 것: `newsletter_changes`(연속 호 변화 감지)는 본문 요약이 있어야 해서 0행 그대로.

## 7. 새 경로 후보 — robots/약관 판정(조회 결과, 우회 없음)
- 아래는 이미 DB에 있는 판정만 옮긴 것이다. 새로 확인하지 않은 곳은 "미확인"으로 둔다.
- github_issues: robots 해당 없음(공식 API), 약관 미확인 → 타깃 확대 후보 1순위(영역 안 100%).
- hackernews: robots 미확인, 약관 silent → 이미 상위. 타깃 확대보다 영역 필터가 먼저.
- devto·disquiet: 약관 금지/자동화 금지 + 소유자 예외 → 이미 켜짐, 영역 안 0%.
- make/n8n/bubble/softr/retool/glide 포럼: 약관 자동화 금지 또는 미확인 + 소유자 예외(10/14) → 이미 켜짐, 일 수십 건 수준.
- stackexchange: 꺼짐, 90일 질문 수가 적어 보류 → 재측정 미실시(이번 세션).
- G2·Capterra·TrustRadius: 약관·robots **미확인(이번 세션 확인 못 함)**. 확인 전에는 가지 않는다.
- reddit: **영구 비활성**(남헌 2026-11-16, 법적 리스크). `disabled_reason` 갱신 완료(마이그 `20261116000001_reddit_disabled_reason.sql`).
- YC·TrustMRR 구조화 데이터: YC 는 `yc_companies` 6,387행 적재 완료. TrustMRR 은 미확인.

## 8. 영역별 × 소스 × 건수 (최근 48시간, 현행 영역코드)
- 주의: `analysis_inputs` 에 areas_v2 6분야 코드가 컬럼으로 없다. 현행 영역코드(①~⑨·out-*)로 집계했다. v2 도메인은 `case_bank_labels`·`review_topic_labels`(1만 건대)에만 있어 입력 단위 집계가 불가능하다 — 확인 불가로 둔다.
- ① 회의록·통화 요약: hackernews 766 · appstore 612 · googleplay 120 · github 6
- ② 영업 도우미: appstore 222 · github 22 · hackernews 9
- ③ 마케팅 콘텐츠: appstore 1,044 · github 7 · hackernews 3
- ④ 인사 운영: appstore 34 · github 2
- ⑤ 글쓰기·문서: appstore 316 · github 29
- ⑨ 디자인: appstore 399
- 보류(hold): appstore 84
- 영역 없음: appstore 1,501 · googleplay 556 · hackernews 469
- 영역 외-소비재: clien 80 · devto 61 · bobaedream 25 · youtube 6 · velog 1
- 영역 외-창업가: hackernews 132 · okky 120 · disquiet 45 · make 33 · n8n 9 · bubble 3
- 실패 건수 48시간 표는 `review_collection_runs.parse_failures` 가 7일 합 1건(okky)뿐이라 의미 있는 실패가 없다.
- 읽는 법: ④ 인사 운영(areas_v2 1순위 hr_attendance)이 48시간 36건뿐이다. 우선순위 1순위 분야가 가장 얇다.

## 9. 다음 조치(CC)
1. ④ 인사 운영 분야 타깃 보충: HN·github_issues·appstore 에서 근태·급여·HR 키워드 타깃 추가(우선순위 1).
2. github_issues 타깃 확대(영역 안 100%, 약관 미확인이지만 공식 API).
3. 한국 커뮤니티 새 게시판 발굴은 약관 판정 뒤. 영역 안 비율이 0% 이므로 "건수"가 아니라 영역 필터 개선이 먼저다.
4. stackexchange 재측정, G2·Capterra 약관 확인은 다음 세션(이번에는 못 함).
