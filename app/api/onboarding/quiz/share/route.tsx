import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { QUESTION_COUNT, scoreHeadline, summarizeScore } from '@/lib/onboarding/quiz'
import { fetchCompletedScores } from '@/lib/onboarding/quiz-store'
import { loadKoreanFont } from '@/lib/og/korean-font'

// Stage 6 — "감 점수" 공유 이미지 (1200×630 OG).
//
//   GET /api/onboarding/quiz/share?score=7[&total=10]
//
// 왜 서버 OG 라우트인가: next/og 의 ImageResponse 는 Next 에 내장이라 신규
// 의존성이 0개다. 클라이언트 캔버스 렌더링은 기기·폰트·DPR 에 따라 결과가
// 달라지고, og:image 로 쓸 URL 이 생기지 않는다. 다운로드는 이 URL 을 가리키는
// <a download> 로 제공한다(AC-2).
//
// ★ AC-4: 퍼센타일 분기를 화면과 **같은 함수**(scoreHeadline)로 한다. 응답자
//   30명 미만이면 이미지에도 "상위 N%"를 쓰지 않는다. 이미지에서만 과장되면
//   분기를 둔 의미가 없다 — 공유되는 건 이미지다.
//
// 점수는 쿼리 파라미터다(위조 가능). 자랑용 이미지라 그 위조는 본인 손해로
// 끝난다. 반면 응답자 수·퍼센타일은 **서버에서 읽는다** — 그쪽을 클라이언트가
// 넘기게 하면 과장 금지 분기를 클라이언트가 우회할 수 있다.

const WIDTH = 1200
const HEIGHT = 630
const BG = '#0b0f19'
const FG = '#f8fafc'
// violet-400 — 앱 브랜드(보라)와 맞춘다. OG 이미지는 CSS 변수를 못 읽어 값을 박아야 한다.
const ACCENT = '#a78bfa'
const MUTED = '#94a3b8'

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const total = Number(params.get('total') ?? QUESTION_COUNT)
  const score = Number(params.get('score'))

  const validTotal = Number.isInteger(total) && total > 0 && total <= QUESTION_COUNT
  const validScore = Number.isInteger(score) && score >= 0 && validTotal && score <= total
  if (!validScore) {
    return new Response('score 파라미터가 올바르지 않습니다.', { status: 400 })
  }

  // 응답자 수·퍼센타일은 서버에서만 읽는다. 못 읽으면 null → 수치를 지어내지 않는다.
  const supabase = await createClient()
  const scores = supabase ? await fetchCompletedScores(supabase) : null
  const summary = summarizeScore(score, total, scores)

  const headline = scoreHeadline(summary)
  const title = '소구점 판정 감 점수'
  const footer = 'SolutionArchive · 온보딩 자가진단'
  const font = await loadKoreanFont(`${title}${headline}${footer}`, 'onboarding/quiz/share')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          color: FG,
          fontFamily: font ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div style={{ fontSize: 44, color: MUTED }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ fontSize: 220, color: ACCENT, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 96, color: MUTED, lineHeight: 1 }}>/{total}</span>
        </div>
        <div style={{ fontSize: 52, marginTop: 32 }}>{headline}</div>
        <div style={{ fontSize: 32, color: MUTED, marginTop: 48 }}>{footer}</div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: font ? [{ name: 'NotoKR', data: font, weight: 700, style: 'normal' }] : undefined,
      headers: {
        // 파일명을 붙여 <a download> 가 의미 있는 이름으로 저장되게 한다.
        'Content-Disposition': `inline; filename="solutionarchive-quiz-${score}of${total}.png"`,
      },
    },
  )
}
