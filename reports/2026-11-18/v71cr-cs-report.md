# v71cr·v71cs 실행 보고 (2026-11-18, CEO-STAFF 세션)

## 원인 표 1 — 낮은 확신 줄이 어디서 왔나 (case_bank_labels 12,224줄 중 낮음 11,179)
- 규칙 일괄(rule-no-description) 4,428: failure_ledger 2,460 + ss_moves 1,968 — 전부 증거 문장 빈 줄. 아래 재라벨 대상.
- Haiku 4,958: 증거 문장 빈 줄 2,924 / 문장은 있는데 모델이 낮음 2,034 (yc 1,617·idea_bank 316·ss_businesses 101).
- 도메인 재라벨 1,504·뉴스레터 추출 289: 전부 증거 문장 빈 줄(라벨 방식상 문장을 안 받음).
- 증거 문장 빈 줄 합계 9,145 = 4,428+2,924+1,504+289. 지시서의 "75%" 확인.
- 확신 등급 정의(label-case-bank.mjs): 증거 문장이 없으면 무조건 low, domain 도 unknown 으로 내린다. 문장이 있으면 모델이 high/mid/low 를 스스로 고른다.
  → 낮음은 "틀렸다"가 아니라 "근거 문장이 없다/모델이 자신 없다"는 뜻이다. 그리고 사례 매칭 엔진(lib/consult/discover.ts)은 confidence 칸을 읽지 않는다 — domain 일치와 outcome<>'unknown' 만 본다. 그래서 낮음 91%는 엔진 품질에 직접 영향이 없고, 실제 병목은 outcome unknown(아래 표 2).

## 원인 표 2 — 결과 칸 '모름'과 yc status 대응
| yc status | 꼬리표 outcome | 줄 수 |
|---|---|---|
| Acquired | acquired 685 / unknown 23 / 라벨 없음 135 | 843 |
| Active | unknown 1,794 / acquired 1 / 라벨 없음 2,617 | 4,412 |
| Inactive | unknown 709 / zombie 184 / failure 21 / acquired 8 / 라벨 없음 187 | 1,109 |
| Public | unknown 16 / success 3 / acquired 1 / 라벨 없음 3 | 23 |
- 가설 확인: status 를 안 쓴 것이 맞다(Inactive 709·Acquired 23·Public 16 이 unknown).
- 키: case_id = 'yc_companies:'||slug. Inactive 1,109 중 라벨 있음 922·없음 187. 이전 "라벨 없음 1,109"는 키 불일치 착시.
- 모순 9줄 남김(Active→acquired 1, Inactive→acquired 8, Public→acquired 1): 모델 추측과 status 가 다름. 손대지 않고 보고만.

## 조치 (전부 추가 전용, 기존 case_bank_labels 무변경)
- 마이그 20261118000001: case_bank_label_revisions 신설(UNIQUE(case_id,label_run), RLS 켬·anon/authenticated 회수 — 양성/음성 확인). 이유: 기존 표가 UNIQUE(case_id)라 새 label_run 행을 못 넣음. 롤백 파일 있음.
- yc status 결정적 채움 748행(모델 0회): acquired 23·success 16·zombie(Inactive, failure 단정 안 함) 709. run=v71cr_yc_status_20261118.
- 규칙 줄 재라벨(Haiku, 실제 비용 $10.59):
  - failure_ledger 2,460: 낮음 100%→91%(2,241), 결과 unknown 69%→47%(1,147), 증거 문장 있음 1,318.
  - ss_moves 1,968: 낮음 100%→85%(1,673), 결과 unknown 97%→86%(1,693), 증거 문장 있음 1,190.
  - 50건 시험은 78%·74%였는데 전체는 91%·85%였다. 앞 50건이 대표가 아니었다(시험 결과를 전체 예측으로 쓰지 말 것).
- 읽는 쪽(discover.ts·mode-c2-pool)은 아직 개정 표를 안 본다. 합치는 뷰/코드 전환은 별도 PR 필요(미적용).

## T2 킬스위치 후속 (v71cs §1 일부, 읽기만)
- 사람 채점 204건, 불일치 29(14.2%). 관련 예측 198건 중 사람이 달리 본 것 28.
- 소스별 오류(관련 예측 중): hackernews 12/50(24%)·github_issues 3/9(33%)·appstore 6/70(8.6%)·googleplay 5/58(8.6%). 프롬프트 v22 46건 중 15건, v24 는 사람 채점 0건 확인.
- 가드 dry-run(정답지 204건): 본문<120자 제외 → 오류 5 제거, 맞는 판정 25 같이 제외(나쁜 거래). 앱·플레이 <60자 → 오류 3, 맞는 판정 9. 해커뉴스 구인 정규식 → 0건에 걸림. "제품명 없음" 가드는 제품명 칸 구조를 못 봐서 미측정.
- 시사: 길이 가드는 부적합, 소스 단위(해커뉴스·github) 처리가 효과가 크다. 적용은 남헌 결정.
- 아직 안 한 것: 반영 대장 표(P1~P4), 프롬프트 보강 후보, 11/17 표본 20건 채점 반영과 킬스위치 재계산(채점 입력 확인 불가 — 사람 채점 DB 반영이 안 보임).

## R10 일정 (v71cs §3) — 날짜는 모른다
- 게이트는 5조건 전부 필요(lib/consult/refgroup.ts gateOpen): 합성 복구·κ≥0.61·시간분할 Brier·민감도·n 임계값.
- 코드: 시간분할·Brier·κ 함수는 있음, 합성 복구 시험 스크립트 scripts/refgroup-synth.mjs 있음. 실제로 각 조건이 지금 통과인지·입력(합성 500건, 이중 코딩 데이터)이 있는지는 이 세션에서 확인하지 못했다.
- 모르는 이유: 이중 코딩의 두 번째 판정자가 누구인지(사람/모델)와 시간분할에 쓸 연도 칸 채움 비율을 아직 안 읽었다. 알아내는 법: refgroup-synth.mjs 실행 결과 + 사례 은행 year 채움률 + 이중 코딩 표본 유무 확인.

## 미완
- v71cs §1-1·4·5(반영 대장·프롬프트 보강·킬스위치 재계산), §2(L25 50건 표본 — 개정 표를 읽는 경로가 없어 지금 만들면 옛 줄 기준이라 보류), v71cr §5 장별 꼬리표는 11/19.
