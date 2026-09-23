import { PubShell } from '../../_pub/components/PubShell'
import { QuizClient } from './quiz-client'

// Stage 6 — 온보딩 "감 점수" 퀴즈의 껍데기.
//
// 2026-09-23 A3: 화면을 `app/_pub` 로 옮겼다. `PubShell` 이 async 서버 컴포넌트라
// 상태를 가진 퀴즈 본체는 `quiz-client.tsx` 로 내렸다(클라이언트 컴포넌트는 서버
// 컴포넌트를 자식으로 못 렌더한다 — 반대는 된다). 퀴즈 API·session_id·저장 경로는 불변이다.
//
// 테마가 다크인 이유: 이건 다크 랜딩에서 "내 문제로 시작"을 누르고 이어지는 첫 화면이다.
// 선택지·결과 카드는 흰 섬(`PubChoice`·`Panel`)이라 읽는 부분은 라이트로 뒤집힌다.
//
// `_ds/AppNav` 는 `/onboarding` 에서 스스로 숨는다 — 헤더가 겹치지 않는다.

// 정적 프리렌더 금지. PubNav 가 로그인 여부로 갈린다 — 빌드 시점에 굳으면 로그인한 사람에게도
// "로그인" 링크가 박힌 HTML 이 캐시된다(랜딩과 같은 이유).
export const dynamic = 'force-dynamic'

export const metadata = { title: '소구점 판정 감 점수' }

export default function OnboardingQuizPage() {
  return (
    <PubShell theme="dark" footerNote="퀴즈는 로그인 없이 익명으로 돈다. 응답은 세션 단위 집계에만 쓴다.">
      <QuizClient />
    </PubShell>
  )
}
