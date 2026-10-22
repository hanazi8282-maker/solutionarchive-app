# core.hooksPath 변경 기록 (남헌 승인 2026-10-15, B안)

## 변경
- 대상: `C:\Users\DCU\Desktop\Cowork\SolutionArchive\.git\config` (리포 공통 로컬 설정, 모든 워크트리가 공유)
- **변경 전 값:** `C:\Users\DCU\Desktop\Cowork\SolutionArchive\.githooks`
- **변경 후 값:** `.githooks` (각 워크트리 자기 루트의 훅을 쓴다)
- 실행: `git config --local core.hooksPath .githooks`

## 롤백 명령
```
git -C "C:\Users\DCU\Desktop\Cowork\SolutionArchive" config --local core.hooksPath "C:\Users\DCU\Desktop\Cowork\SolutionArchive\.githooks"
```

## 왜
옛 전역 훅은 `methodology/content/MANIFEST.txt` 가 없으면 실패한다(이 폴더는 10-13 부터 비공개 리포로 옮겨 추적하지 않는다). 무시된 파일을 `git add` 하다가도 실패한다. 에이전트 둘이 이 때문에 `--no-verify` 로 커밋했다.

## 검증 (변경 후)
- 새 훅을 가진 워크트리(sa-ig): `git hook run pre-commit` → rc 0, "MANIFEST 검사 건너뜀" 메시지. [직접 실행 확인]
- 모든 워크트리에 `.githooks/pre-commit` 이 있음(훅 없는 워크트리 0곳). 단 **옛 훅 사본(md5 499109b6)을 가진 워크트리가 다수**(새 훅 dd398d6a 는 최근 main 기반 워크트리만)라서, 그곳에서는 변경 전과 동작이 같다 — 개선은 main 을 따라간 워크트리부터.
- 옛 훅과 리포 훅의 차이는 3곳뿐(MANIFEST 없으면 content-gate 동기화 건너뜀 · MANIFEST 없으면 대조 건너뜀+메시지 · 무시된 파일 add 건너뜀). methodology 폴더가 있는 클론에서는 완전히 같은 검사.

## 우회 커밋 2건 재검증
- `85475ad`(#539 첫 시도, 셀프테스트 20줄): methodology·references 변경 0건. 현재 relevance-second-judge-selftest 70 pass, approval-scope 5 pass. [직접 실행 확인]
- `c957a6e`(#541, 4개 scripts 파일): methodology·references 변경 0건. block-stop-selftest 46건 통과. [직접 실행 확인]
- 훅이 본래 잡으려던 것(MANIFEST 드리프트, content-gate references 동기화): methodology 가 있는 체크아웃에서 `manifest-methodology.py --check` = 통과(31 파일), `sync-content-skill.sh --check` = 전부 SAME. 두 커밋이 그 파일들을 건드리지 않았으므로 우회로 새어 들어간 변경 없음.
