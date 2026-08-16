---
description: 버그/에러를 debugger 주도로 진단·수정·재검증한다.
argument-hint: <에러 설명 또는 "latest"(최신 preview 에러 자동 수집)>
---

대상: $ARGUMENTS

1. 대상이 "latest"면 @qa-verifier 로 최신 preview 배포의 Vercel/Supabase 에러를 먼저 수집한다.
2. @debugger 로 근본원인 진단 → feat/fix 브랜치에 패치 → 푸시.
3. @qa-verifier 재검 (최대 4회전).
4. PASS면 @reporter 로 보고 + PR 승인 요청.

파괴적 DB 변경이 필요하면 실행하지 말고 🔴로 승인 요청한다.
