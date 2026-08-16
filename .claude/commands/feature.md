---
description: 기능 의도를 받아 기획→구현→검증→자가수정→PR→보고 전체 루프를 자율 실행한다 (prod 머지만 사용자 승인).
argument-hint: <만들고 싶은 기능/화면 설명>
---

다음 의도로 표준 자율 루프를 실행한다: $ARGUMENTS

CLAUDE.md의 절대 규칙과 표준 루프를 따른다:

1. @architect 로 기획·영향범위·스키마 변경안·수용기준(AC)·리스크등급을 받는다.
2. 🔴 리스크(파괴적 DB/비용/prod)면 여기서 멈추고 reporter로 승인 요청. 그 외엔 진행.
3. feat/<slug> 브랜치 생성 → @implementer 구현 + 비파괴 마이그레이션 → 푸시(preview 배포).
4. @qa-verifier 로 preview 검증 + 로그 수집.
5. FAIL이면 @debugger ↔ @qa-verifier 최대 4회전. 통과 못하면 에스컬레이션.
6. PASS면 PR 생성 → @reporter 로 보고 + 머지 승인 요청.

머지는 절대 하지 않는다 — 사용자 몫이다.
