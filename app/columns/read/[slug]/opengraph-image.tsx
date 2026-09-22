import { ImageResponse } from 'next/og'
import { columnReadable } from '@/lib/columns/markdown'
import { getApprovedColumn } from '@/lib/columns/read'
import { loadKoreanFont } from '@/lib/og/korean-font'

// 칼럼 공유 카드(1200×630). app/api/onboarding/quiz/share/route.tsx 와 같은 방식 —
// next/og 는 Next 내장이라 신규 의존성이 0이다. 폰트 서브셋 로더는 lib/og/korean-font.ts 로 공유한다(랜딩 OG 와 같은 로더).
//
// 승인되지 않은 칼럼의 이미지는 만들지 않는다(조회 조건이 읽기 화면과 같은 함수다).

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'SolutionArchive 칼럼'

const BG = '#0b0f19'
const FG = '#f8fafc'
const ACCENT = '#a78bfa' // violet-400 — OG 이미지는 CSS 변수를 못 읽어 값을 박는다.
const MUTED = '#94a3b8'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await getApprovedColumn(slug)
  // 못 읽었을 때와 없을 때를 둘 다 이미지로 위장하지 않는다 — 카드가 없으면 404 다.
  if (!res.ok || !res.data) return new Response('not found', { status: 404 })

  const { title, reader_type } = res.data
  const summary = columnReadable(res.data.body, 90).summary
  const footer = `SolutionArchive · ${reader_type}를 위한 칼럼`
  const font = await loadKoreanFont(`${title}${summary}${footer}`, 'columns/og')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: BG, color: FG, padding: 72, fontFamily: font ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 60, lineHeight: 1.25, color: FG }}>{title.slice(0, 60)}</div>
          <div style={{ fontSize: 30, lineHeight: 1.5, color: MUTED, marginTop: 28 }}>{summary}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 56, height: 6, background: ACCENT, marginRight: 20 }} />
          <div style={{ fontSize: 26, color: MUTED }}>{footer}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'NotoKR', data: font, weight: 700 as const, style: 'normal' as const }] : undefined,
    },
  )
}
