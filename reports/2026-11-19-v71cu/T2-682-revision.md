# PR #682 수정 — 남헌 확정 기준 반영 (2026-11-19)

브랜치 `feat/t2-improvement-p1-p4` 를 `origin/main`(1309bc19)에 리베이스했다. 충돌은 `scripts/relevance-second-judge-auto.mjs` import 한 곳이었다. #684 는 `chunkReviews` import 를 지웠고, PR 은 `parseInfoMode`·`withInfoCriteria` 를 더했다. #684 쪽을 유지하고 PR 의 import 만 얹었다.
LLM 호출과 DB 실행은 하지 않았다. 킬스위치 수치(`KILL`)는 바꾸지 않았다.

## 1. 남헌 확정 기준

- a) 자사 홍보글은 빼지 않고 태그만 단다. 판정은 바꾸지 않는다.
- b) 기능·가치를 설명하는 소개글은 정보 있음이다.
- c) GitHub 버그 리포트(스택트레이스·재현 단계·환경 위주)는 무관이다. 기능 요청은 정보 있음이다.
- d) 11/14 방향과 남헌 #20 판정(Doppler 채용글=관련·정보 있음, 개발자 도구도 영역 안)에 부딪치는 규칙은 없앤다.

## 2. 반대 방향 규칙 — 찾은 것과 처리

| # | 규칙 | 위치 | 방향 | 처리 |
|---|---|---|---|---|
| 1 | info-v2 (b) "제품 소개·마케팅 문구 되풀이 → info=false" + F 예시 "소개 문구 되풀이" | `relevance-criteria.ts` (PR 초안) | b·d 와 반대 | **제거.** 새 (b) 로 바꿨다: 소개·회사 소개·채용 공고라도 기능·가치를 설명하면 relevant·info=true |
| 2 | P1 `RR_V2_EXCLUDED_SOURCES` 에 `hackernews` 추가(출처째 제외) | `auto-approval.ts` (PR 초안) | a·d 와 반대 | **제거.** main 과 같은 `{github_issues}` 로 되돌렸다 |
| 3 | `github_issues` 출처째 제외(v71cp 내용 가드) | `auto-approval.ts` (main) | c 와 반대(기능 요청이 승인 경로에 못 들어간다) | **v2 에서 해제.** `passesRrV2ContentGuard(r, 'v2')` 는 출처 제외 없이 60자·본문 확인만 한다. 버그 리포트 거르기는 판정 기준 (c) 가 맡는다. v1(기본)은 main 그대로 |
| 4 | `out-founder` 프로젝트 단위 제외(자동 승인·감사 표본·2차 대기) | `approval-scope.ts`, `relevance-second-judge-auto.mjs` (main, L-20b) | a 와 반대(이름은 태그인데 실제로는 제외) | **v2 에서 해제.** `scopeOptionsFor(INFO_CRITERIA)` 를 자동 승인·감사 표본(`relevance-grading-sample`)·2차 대기가 같이 쓴다. `out-consumer` 는 v2 에서도 뺀다 |
| 5 | info-v1 F 예시 "Can you support Apple Pay? — 정보 없는 질문 한 줄" | `relevance-criteria.ts` (main, v1 상수) | c 와 반대(기능 요청인데 false) | **v2 에서 T 로 뒤집었다.** v1 상수는 바이트 그대로 둔다(해시 고정, 옛 판정 재현용) |
| 6 | info-v2 (c) "스택 트레이스·버전·환경 기재 → info=false" | `relevance-criteria.ts` (PR 초안) | c 와 같은 방향, 범위만 좁다 | **수정.** 버그 리포트 정의(재현 단계 포함)와 "기능 요청 = relevant·info=true" 를 한 문장에 묶었다 |
| 7 | v2.1~v2.4 규칙 (10)·(15) "SaaS 인데 활성 영역 밖 → irrelevant(영역 밖:)" | `relevance-criteria.ts` (main, 운영 v24) | d 와 반대(개발자 도구는 `config/areas.json` 에 없어 영역 밖이 된다) | **v2 블록 (d) 로 덮었다.** "개발자 도구는 영역 안, (10)·(15)의 영역 밖으로 보내지 않는다." v24 본문은 바이트 그대로다 |
| 8 | 옛 t2c `RELEVANCE_CRITERIA` "창업기·채용·창업자 자사 설명 = irrelevant", 경계 사례 I "Baremetrics 채용 공고"·I "cal.com 창업자" | `relevance-criteria.ts:41-85` (main) | a·d 와 반대 | **그대로 둠.** `RELEVANCE_CRITERIA=old` 와 2차 기본 지시문(`SECOND_OPINION_INSTRUCTIONS`)에만 들어간다. 운영 v24 프롬프트에서는 v2.4 본문으로 치환돼 빠진다(셀프테스트로 확인). 해시 고정 상수라 손대면 옛 판정 재현이 깨진다 |
| 9 | v2.1 (9)·v2.2 (14) "자사 홍보도 이유·구분 기준이 있으면 relevant **가 될 수 있다**" | 같은 파일 (운영 v24 에 포함) | 조건부라 a·b 와 부딪치지는 않는다. 다만 약하다 | **v2 블록 (b)·(e) 로 보강.** 블록 머리에 "회사 이야기·자사 홍보·채용 공고·영역 밖 문장과 부딪치면 이 블록이 우선한다"를 적었다 |

## 3. 바뀐 것

- **info-v2 블록**: `PRODUCT_INFORMATIVE_CRITERIA_V2`(info-v2-2026-11-19). v1 본문(Apple Pay 줄만 T)에 (a)~(e) 를 덧붙였다.
  - (a) 이름 없는 총평 = false. 11-12 감사 ①이다.
  - (b) 기능·가치를 설명한 소개·채용글 = relevant·true.
  - (c) 버그 리포트 = irrelevant·false, 기능 요청 = relevant·true.
  - (d) 개발자 도구 = 영역 안.
  - (e) `promo` 태그. 판정을 바꾸지 않는다.
- **promo 태그**: v2 일 때만 1차 출력 형식 줄에 `"promo":false` 가 붙는다(`withInfoCriteria`). 파서는 이 키를 `self_promo` 로 읽는다. 저장할 칸이 없어서(마이그 없이) `promo=true` 인 행은 reason 끝에 ` [자사홍보]` 를 붙인다. 조회는 `reason LIKE '%[자사홍보]'` 로 한다. verdict·product_informative 칸은 그대로다.
- **기본 꺼짐**: `parseInfoMode` 기본값과 모르는 값은 모두 **v1** 이다. 워크플로 세 스텝(1차·2차·자동 승인)은 `${{ vars.INFO_CRITERIA || 'v1' }}` 로 읽는다. 머지만 해서는 아무것도 바뀌지 않는다. 켜려면 리포 변수 `INFO_CRITERIA=v2` 를 설정한다.
- **v24 결합**: 운영 v24 의 1차 SYSTEM(`systemV24`)과 2차 지시문(`secondOpinionInstructionsV24`)에는 둘 다 info-v1 블록이 글자 그대로 들어 있다. `withInfoCriteria` 가 이 블록을 v2 로 바꾼다. v2.4 본문((1)~(17))은 그대로 두고, v2 블록이 그 뒤에 와서 우선 문장으로 (10)·(15)·회사 이야기 문장을 덮는다. 치환할 블록이 없으면 던진다(§7.1). 셀프테스트가 v24 1차·2차 모두 확인한다.
- **하네스**: `t2-approval-eval.mjs` 기본값을 `--criteria v24`(운영 리포 변수값)와 `--info v1` 로 바꿨다. A∧가드 채점도 `--info` 를 따른다.
- **재감사 표본**: `t2-resample.mjs` 는 출력 파일이 이미 있으면 덮지 않고 멈춘다. 전/후에 같은 표본을 쓰기 위해서다. 새로 뽑을 때는 `--force` 를 준다.

## 4. 재측정 명령 (오케스트레이터 실행 — 전/후 같은 표본, 다른 것은 `--info` 하나)

```
node --env-file=.env.local scripts/t2-resample.mjs --new-since 2026-11-18 --seed 20261119
node --env-file=.env.local scripts/t2-approval-eval.mjs --sample ops/state/t2-eval/resample-2026-11-19.json --criteria v24 --info v1 --local-claude --out ops/state/t2-eval/pr682-before.json
node --env-file=.env.local scripts/t2-approval-eval.mjs --sample ops/state/t2-eval/resample-2026-11-19.json --criteria v24 --info v2 --local-claude --out ops/state/t2-eval/pr682-after.json
```

- 캐시는 기준·info·few-shot 조합(TAG)마다 따로 둔다. 그래서 전/후 결과가 섞이지 않는다. `reports/<KST>/t2-approval-eval.md` 는 나중 실행이 앞 실행을 덮으니, 비교는 두 `--out` json 으로 한다.
- 켜는 판단(계획 §6 조건 1): after 의 `with_content_guard.precision` 이 93% 이상이어야 한다. v2 는 가드에서 출처 제외를 하지 않으니 `by_source` 의 github_issues·hackernews 오류도 함께 본다. 기준을 넘으면 `INFO_CRITERIA=v2` 를 켜고 `AUTO_APPROVAL_SINCE` 를 그 시각으로 옮긴다.

## 5. 셀프테스트

- `auto-approval-selftest`: 107 pass / 0 fail, 내용 가드 7건. B세트 회귀(가짜 LLM)가 확인하는 것:
  - AFFiNE·Jitsi 버그 리포트는 무관이고, v2 에서도 승인 후보가 아니다.
  - Doppler 채용글은 관련·정보 있음이고 promo=true 다. v2 에서는 승인 후보, v1 에서는 옛 동작대로 제외된다.
  - 기능 요청(github)은 v2 에서만 승인 후보다. 앱 리뷰는 두 모드 모두 승인 후보로 남는다.
  - promo 키가 있든 없든 rel·info 는 같다.
- `approval-scope` 6 pass · `relevance-second-judge` 79 pass · `t2-approval-eval` 37 pass · `t2-resample --selftest` 통과.
- 관련 셀프테스트 21개 중 20개가 통과했다. `audit-sheet-selftest` 는 5건 실패하는데, 이번 변경과 무관하게 원래부터 실패하던 것이다. 그 테스트가 찾는 `- name: Audit sample sheet` 스텝이 현재 어느 워크플로에도 없다.

## 6. 확인 못 한 것

- 모델이 B세트 실제 원문에 이 기준대로 답하는지. 셀프테스트는 가짜 응답과 합성 요약문만 쓴다. 이것은 재측정이 잰다.
- B세트 20건 가운데 AFFiNE·Jitsi·Doppler 행의 input_id 와 실제 `source_key`·`area_code`. DB 를 보지 않았다. Doppler 를 hackernews·out-founder 로 둔 것은 가정이다.
- 11/14 지시 원문. 리포에 없다(`T2-prompt-area-audit.md` §c). 남헌 #20 판정도 원문을 보지 못했다.
- v2 에서 github_issues·hackernews·out-founder 가 승인 경로에 다시 들어올 때의 오류율. 11-18 실측(HN 24%·github 33%)은 v1 기준이다.
- promo 를 전용 컬럼으로 저장하는 일. 필요하면 마이그 파일을 따로 만든다. 지금은 reason 끝 표시뿐이다.
- `graphify update .` 는 돌리지 않았다(분류기 차단 이력).
