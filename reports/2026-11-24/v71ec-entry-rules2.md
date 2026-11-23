# v71ec 입구 규칙 보강 2차 (er-v1.3, 꺼짐 기본, 초안)

- 코드: `lib/analysis/entry-rules.ts` — `EntryBoost` 에 `tagMatch`·`devRelease` 두 스위치 추가. 권장 객체 `ENTRY_BOOST_V13 = { setupPenalty, topicGate, nameWindow, tagMatch, devRelease }`(전부 true, 얼림)
- 둘 다 **좁히기 전용**: 점수는 바꾸지 않고 `pass` 만 false 로 바꾼다. 켜서 통과가 늘어나는 글은 없다(셀프테스트 (h) 가 고정).
- 꺼짐: 두 스위치가 없거나 false 면 er-v1.2 와 판정·이유·버전 문자열까지 같다(리플레이 6,636 판정 비교 다름 0). 하나라도 켜면 버전 `er-v1.3`.
- 운영 배선·워크플로·리포 변수는 바꾸지 않았다. `gradual-release.ts` 는 여전히 넷째 인자 없이 부른다.
- 리플레이: `node scripts/entry-rules-v71ec-replay.mjs --dir <principle-pilot/v71cx> [--baseline <er-v1.2 entry-rules.ts>] [--write]`

## 1. 두 갈래

| 갈래 | 개념 | 어디에 | 막는 조건 |
|---|---|---|---|
| (d) `tagMatch` 제품 꼬리표 일치 | 꼬리표 제품명(원래 이름 · 첫 낱말 · 띄어쓰기 없앤 꼴)이 든 문장과, 그 뒤 3문장 중 바로 다음 문장 또는 대명사("it/they/the app")로 이어지는 문장이 그 제품을 **직접 평가하거나 사용 경험을 보고**하는가. 새 제품이 문장 주어로 나오면 고리를 끊는다. 곁다리 언급 = 예시·열거 · 주소(URL) · 3낱말 이하 괄호 · 관사 붙은 소문자 보통명사 | HN 만(포럼은 장소가 곧 제품) | ① 곁다리 언급뿐 ② 직접 평가·사용 보고 없음 ③ 다른 제품이 3문장 이상 ∧ 꼬리표 제품 문장의 2배 이상인데 1인칭·주변 사용 보고가 없음 |
| (e) `devRelease` 개발·릴리스 이야기 | 묶음 5개: 릴리스 과정(sprint·이슈 번호·PR·merge·commit·changelog·core team·"fixed in x") · 설치·업그레이드(docroot·composer·install·upgrade·버전 사이 업데이트·빠진 파일·버전 번호 여럿) · 설정·코드(config·파일 확장자·DB·server·code·API·customize·override) · 만들고 넓히기(plugin·module·settings·front/back end·callback) · 설정 질문("how do I", "is it normal", "do you know", 오류 로그). 기존 DEV·INSTALL·설정 묶음도 같은 묶음으로 합쳐 센다 | HN·SuiteCRM·Mautic | 묶음 2개 이상 ∧ 낱말 수 ≥ 3 + 3×(사용자 경험 낱말 수). **사용자가 겪은 눈에 보이는 고장(제출·연락처·방문 기록 유실, 비밀번호 평문·보안 노출, 데이터 손실)은 막지 않는다** — 남헌 규칙상 약한 정보 |

## 2. 문턱의 개념 근거

- **뒤로 3문장**: 남헌 지시 창(±3). 앞쪽은 대명사가 뒤 제품을 가리키는 일이 드물어 뒤쪽만 본다.
- **다른 제품 3문장 · 2배**: 1~2번 나오는 비교 대상은 지나가는 비교이고, 3문장 이상이면서 꼬리표 제품보다 두 배 많으면 글의 대상이 그 제품이다.
- **괄호 3낱말**: "(X)", "(also X)" 는 꼬리표 표기이지 문장이 아니다. 4낱말 이상 괄호("why does X keep these?!")는 말이다.
- **묶음 2 · 낱말 3**: 사용자도 설정 낱말 하나쯤은 지나가며 쓴다. 서로 다른 개발 개념 두 갈래가 겹쳐야 "개발자끼리 대화"다.
- **사용자 낱말 1 = 개발 낱말 3**: 문턱(3)과 같은 크기. 사용자 판단 낱말 하나가 빽빽함 한 단위를 상쇄한다. 남헌 예시의 "because" 도 여기 들어간다.

## 3. 리플레이 — 학습 행(규칙을 만들며 원문을 본 88행: 60행 라벨 + 6차 30행, 애매 2 제외)

⚠️ 학습 성적이다. 8차 표본(90행)은 라벨이 없어 "무엇을 막는가" 진단에만 썼다. 조정은 2회.
칸 = 오류 막음 / 놓친 오류 / 좋은 글 잘못 막음.

### 1회차(첫 구현)

| 변형 | HN | SuiteCRM | Mautic | others | 합계 |
|---|---|---|---|---|---|
| er-v1.2 | 17/3/2 | 7/0/0 | 7/0/0 | 11/0/1 | 42/3/3 |
| +tagMatch | 18/2/2 | 7/0/0 | 7/0/0 | 11/0/1 | 43/2/3 |
| +devRelease | 17/3/2 | 7/0/0 | 7/0/0 | 11/0/1 | 42/3/3 |
| er-v1.3 | 18/2/2 | 7/0/0 | 7/0/0 | 11/0/1 | 43/2/3 |

8차 진단: er-v1.3 이 HN 11/30 · SuiteCRM 0/30 · Mautic 3/30 을 막음. 과거 HN 승인 글(사람 채점 안 된 2,034행): er-v1.2 막힘 1,008 → er-v1.3 1,202.
문제 두 가지: (e) 가 SuiteCRM 에서 하나도 못 막았다(개발 답변에도 "because" 하나가 있으면 통째로 살아남음 · 플러그인·설정 낱말이 묶음에 없음). (d) 가 "X helps. I sync it…" 처럼 바로 다음 문장에서 평가하는 글을 막았다.

### 2회차 조정 — 갈래당 한 가지씩

- (e) 사용자 낱말을 "있다/없다" 가 아니라 **상쇄 비율**(1 = 개발 낱말 3)로 셈. 기존 DEV·INSTALL·설정 묶음을 합쳐 셈(새 정의 아님, 재사용). "만들고 넓히기" 묶음 추가. 고장 표지에 "stops appearing / not consistently recorded" 꼴 추가.
- (d) 바로 다음 문장은 대명사 없이도 같은 이야기로 봄. 사용 경험 동사(helps·impressed·paid for·sync with·cancelled 등) 추가.

| 변형 | HN | SuiteCRM | Mautic | others | 합계 |
|---|---|---|---|---|---|
| er-v1.2 | 17/3/2 | 7/0/0 | 7/0/0 | 11/0/1 | 42/3/3 |
| +tagMatch | 18/2/2 | 7/0/0 | 7/0/0 | 11/0/1 | 43/2/3 |
| +devRelease | 18/2/2 | 7/0/0 | 7/0/0 | 11/0/1 | 43/2/3 |
| **er-v1.3** | **19/1/2** | 7/0/0 | 7/0/0 | 11/0/1 | **44/1/3** |

8차 진단: HN 6/30 · SuiteCRM 3/30 · Mautic 5/30 막음. 과거 HN 2,034행: er-v1.2 막힘 1,008 · 통과 1,026 → er-v1.3 막힘 1,165 · 통과 869(새로 막힘 157 — 평가 없음 95 · 곁다리만 43 · 다른 제품 13 · 개발 11). 새로 막힌 글 중 좋은 글이 몇 개인지는 정답이 없어 세지 않았다.

## 4. 무엇을 막는가 — 8차 표본에서(라벨 없음, 규칙 판정만)

- (d) 다른 제품: Salesforce 경험담 속 한 줄 — "is pain, so we have Outreach and Salesloft"
- (d) 곁다리: 15Five 가 각주 주소로만 — "[0] https://www.15five.com/"
- (d) 곁다리: 경쟁 제품 공동창업자 자기소개 — "I'm a cofounder on a competing product (http://my.salesloft.com)"
- (e) 업그레이드 뒤 파일 누락 — "I do use docroot, and both of those files are missing"
- (e) 이슈 번호·고쳐진 버전 — "related to issue #17592 … which you fixed in 7.2.2?"
- (e) 코드 수정 안내 — "look at the accounts detailviewdefs.php and “copy” the recordaction section"

## 5. 한계·확인 못 한 것

- **8차 통과선(소스별 30행 중 오류 ≤4)을 넘을지는 모른다.** 남헌 오류율(HN ~27–33%, SuiteCRM/Mautic ~30–57%)을 그대로 놓으면 SuiteCRM 3건·Mautic 5건 막음으로는 모자랄 가능성이 크다. 남은 유형: 답변자가 설정값을 안내하는 짧은 글(개발 낱말 1묶음), 자기 애드온 소개(기존 홍보 감점이 못 잡는 꼴), 사용자 낱말이 섞인 개발 제안.
- (e) 낱말 수에 기존 DEV·INSTALL 이 새 묶음 낱말과 같은 개념일 때 두 번 세는 경우가 있다(예: install). 2회 조정 상한이라 고치지 않았다 — 빽빽함을 조금 과대평가하는 쪽이다.
- 꼬리표 별칭은 이름에서 만든 변형뿐(옛 이름 "ZenPayroll" 같은 별칭 표는 없다).
- 학습 행 밖 성적은 새 확인 시트(`v71ec/sheet-past-candidates.json`, seed 71153)로 재야 한다.
