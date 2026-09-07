# Claude Code 전달용 — 프롬프트 A (갱신본)

> 이전 프롬프트 A를 대체한다. 네임스페이스 수정 + 지문 필드 + 신규 파일 3종 + **확인 질문 2건**이 추가됐다.

```
methodology/content/ 를 첨부본으로 전량 교체하고, 검증기를 확장하고, 잔재를 정리해줘.
그리고 마지막에 확인 질문 2건에 답해줘.

## ⚠️ 부분 적용 금지
네임스페이스 충돌 수정이라 일부만 반영하면 게이트 코드와 규칙 코드가 섞여서 판정이 뒤바뀐다.
전량 교체만 유효하다.

## 배경 — 왜 전량 교체인가

게이트 항목과 규칙 번호가 같은 코드를 쓰고 있었다. 특히 프드프는 완전히 겹쳤다.
  게이트 P-10 = 행동 유도   /  규칙 P-10 = 감성 vs 디자인
  게이트 P-13 = 로그        /  규칙 P-13 = 알고리즘 ★★ 최대 취약점
로그 코드 D-/U-/X- 도 통합게이트 D-1~D-5 / U-1~U-3 / X-1~X-3 과 충돌했다.

## 새 규약 (양쪽 02-gate.md 말미에 표로 들어감)
  게이트     G-0~G-13, G-R     (두 아카이브 공통, 무패딩)
  솔파규칙   R-01~R-14         (제로패딩)
  프드프규칙 P-01~P-14         (제로패딩)
  교차       C-01~C-12
  통합게이트 U-1~3 / D-1~5 / X-1~3
  로그       LOG- / UPD- / NEW- / XUP-   (전부 3~4글자 접두어)

## STEP 1 — 파일 전량 교체

교체 대상 (총 21개):
  solfa/     README, 01-methodology, 02-gate, 03-excerpts, 04-decisions, 05-provenance
  pdp/       README, 01-methodology, 02-gate, 03-excerpts, 04-decisions, 05-provenance
  루트       00-gate.md, cross-decisions.md, cross-summary.md, eval-set.md
  _setup/    prompts.md, project-setup-v2.md, verify-additions.py,
             infra-decisions.md ★신규, HANDOVER-SEED.md ★신규, HANDOVER-LOG.md ★신규

※ 기존 setup/ 디렉터리가 있으면 _setup/ 으로 이름을 바꾸고 내용을 첨부본으로 덮어써.
※ 기존 _setup/HANDOVER.md 가 있으면 삭제해 — SEED/LOG로 분리됐다.

## STEP 2 — 지문(Fingerprint) 필드

04-decisions.md 양쪽에 §1-1b "지문" 절이 새로 들어갔다. 판정 로그 템플릿에도
`- **지문** ★:` 줄이 추가됐다. 00-gate.md Ⅴ에도 체크 항목이 붙었다.

왜 넣었냐면: `게이트: 통과`라고 적혀 있어도 그게 판정한 결과인지 적기만 한 것인지
구분할 방법이 없었다. 그러면 D+30에 유효율이 낮게 나와도 규칙이 틀린 건지
판정을 안 한 건지 알 수 없다. 지문이 있으면 검증 가능하다.

첨부본에 이미 반영돼 있으니 별도 편집은 필요 없다. 다만 STEP 3의 검사에 이게 들어간다.

## STEP 3 — 검증기 확장

_setup/verify-additions.py 의 세 검사를 verify-methodology-archive.py 에 병합해줘.

  check_namespace()   게이트/규칙/로그 접두어 검사 4종
  check_paths()       백틱 안 .md 경로 실존 검사
  check_fingerprint() 게이트: 통과 인데 지문이 비면 실패  ★신규

⚠️ 화이트리스트를 반드시 유지해:
   SKIP_DIRS  = ("_setup",)
   SKIP_FILES = {"insight-guide.md", "SKILL.md"}
없으면 오탐이 51건 나온다. 실제로 첫 실행에서 53건 중 51건이 오탐이었다.
오탐 많은 검증기는 무시하게 되고, 그러면 진짜를 놓친다.

병합 후 실행해서 exit code 와 실패 항목을 보고해줘. 0이어야 한다.

## STEP 4 — 스킬 동기화

1. scripts/sync-content-skill.sh 실행 → references 8개 동기화
2. .claude/skills/content-gate/SKILL.md 에서 게이트 참조를 G- 로 갱신
   "pdp P-0~P-13"      → "pdp G-0~G-13"
   "pdp P-3·P-7 건너뜀" → "pdp G-3·G-7 건너뜀"
   그 외 P-숫자가 게이트를 가리키는 곳이 있으면 전부 G- 로
3. SKILL.md 로그 절에 지문 언급 추가:
   "로그 엔트리에 예측과 지문을 반드시 채운다. 지문은 그 판정의 근거가 된 실제 문장이다."

## STEP 5 — 잔재 정리

  cross-summary.md          → 첨부본으로 커밋
  setup/                    → _setup/ 으로 rename 후 커밋
  리포 루트 solfa/           → 삭제 (정본은 methodology/content/solfa/)
  feedback-loop-design.md   → ⚠️ 아래 확인 질문 2번에 답한 뒤에 처리. 지금 건드리지 마

## STEP 6 — 커밋

fix(methodology): 네임스페이스 충돌 해소 + 지문 필드 + 인수인계 SEED/LOG 분리

- 게이트 코드를 양쪽 G- 로 통일 (프드프 게이트/규칙 P- 충돌 해소)
- 로그 코드 LOG-/UPD-/NEW-/XUP- 로 3~4글자 접두어화
- 04-decisions 양쪽에 지문(Fingerprint) 필드 추가
- verify: 네임스페이스·경로·지문 검사 3종 추가
- _setup: infra-decisions / HANDOVER-SEED / HANDOVER-LOG 신규

═══════════════════════════════════════════════════════════
## 확인 질문 2건 — 파일 건드리지 말고 답만 해줘
═══════════════════════════════════════════════════════════

### Q1. solfa/README.md 에 "부재" 줄이 있는가?

9/3에 내가 잘못된 지시를 냈다.
  "05-provenance.md는 재작성하지 않는다. README.md 파일 지도 테이블에
   '부재 — 원문 대조 검증(B-3) 수행 불가' 한 줄만 추가한다."

그런데 파일은 실제로 존재했고 지금은 복구돼 있다. 그 지시가 실행됐다면 README에
잘못된 줄이 남아 있다.

확인할 것:
  grep -n "부재" methodology/content/solfa/README.md
  grep -rn "provenance.*부재\|부재.*provenance" methodology/content/

  - 해당 줄이 있는가? 있으면 정확한 파일·행번호·원문
  - 커밋 7e15df1 에서 검증기의 provenance=False 전제를 되돌렸다고 했는데,
    README 쪽도 같이 고쳤는가 아니면 검증기만 고쳤는가?

※ 첨부본 README로 교체되면 이 줄은 사라진다. 다만 **다른 파일에도 퍼졌는지**
   확인이 필요하다. grep 결과를 그대로 보여줘.

### Q2. feedback-loop-design.md 의 정체는?

지금 "삭제 미스테이징" 상태라고 보고받았는데, 삭제가 맞는지 판단이 안 선다.
아래를 확인하고 답해줘.

  1. 파일 경로와 크기
  2. 첫 30줄 (내용 성격 파악용)
  3. git log --follow 로 언제 누가 왜 만들었는지
  4. 이 파일을 참조하는 다른 파일이 있는가?
     grep -rn "feedback-loop-design" . --include="*.md" --include="*.py" --include="*.sh"
  5. 내용이 아래 셋 중 무엇에 가까운가?
     (a) 콘텐츠 방법론 아카이브의 학습 루프 설계 → methodology/ 로 이동
     (b) 제품(solutionarchive-app)의 인사이트 루프 설계 → 그대로 두거나 docs/ 로
     (c) 이미 04-decisions.md 로 대체된 초기 초안 → 삭제

   판단이 애매하면 (c)로 단정하지 말고 "애매하다"고 답해줘.
   이 프로젝트는 "찾지 못함"을 "없음"으로 접는 실수가 반복적으로 발생했다.

## 보고 사항
- 교체 파일 수 / STEP 3 검증기 exit code / 오탐 건수 (0이어야 함)
- SKILL.md 에서 P- → G- 로 바꾼 지점 목록
- 잔재 정리 결과 (feedback-loop-design.md 제외)
- **Q1 grep 결과 원문**
- **Q2 5개 항목 답변**
- 첨부본과 리포 파일의 md5 대조 결과 (전부 일치해야 함)
```
