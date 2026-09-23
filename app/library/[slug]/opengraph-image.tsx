import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { detailTitle, loadCaseDetail, pickLeadMove } from '@/lib/cases/detail'
import { displayGradeLabel, factCheckLabel } from '@/lib/cases/grade-display'
import { loadKoreanFont } from '@/lib/og/korean-font'

// 케이스 공유 카드(1200×630). 링크를 붙였을 때 뜨는 미리보기 이미지다.
// 만드는 방식은 칼럼 OG(app/columns/read/[slug]/opengraph-image.tsx)와 같다 —
// next/og 는 Next 내장이라 신규 의존성 0, 한글 서브셋 폰트 로더도 그대로 쓴다.
//
// **승인된 케이스만** 이미지가 난다(로더가 읽기 화면과 같은 함수다). 없거나 못 읽었으면
// 이미지를 위조하지 않고 404 다 — 빈 카드가 뜨는 것이 "케이스가 있는데 내용이 없다"로
// 읽히는 것보다 낫다(§7.1).
//
// `/library` 접두사가 공개라 크롤러(익명)가 이 경로에 닿는다 — 정책 변경이 필요 없다.

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'SolutionArchive 케이스'

const BG = '#0b0f19'
const FG = '#f8fafc'
const ACCENT = '#a78bfa' // violet-400 — OG 이미지는 CSS 변수를 못 읽어 값을 박는다.
const MUTED = '#94a3b8'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sb = await createClient()
  if (!sb) return new Response('supabase env missing', { status: 404 })

  const res = await loadCaseDetail(sb, slug, 'library/[slug]/og')
  if (res.status !== 'ok') return new Response(res.reason, { status: 404 })

  const s = res.detail.study
  const lead = pickLeadMove(res.detail.moves)
  const title = detailTitle(s)
  // 카드에 적는 한 줄은 요약이 아니라 **가져갈 행동**이다(CaseCard 와 같은 이유).
  // 없으면 없다고 적는다 — 요약으로 바꿔치기하면 링크 미리보기와 본문이 다른 말을 한다.
  const line = (lead?.transfer_note ?? '').trim() || (s.summary ?? '').trim() || '가져갈 행동이 아직 안 적혔다'
  const grades = `인사이트 ${displayGradeLabel(lead)} · 사실확인 ${factCheckLabel(lead)}`
  const footer = `SolutionArchive · ${s.brand_name}`
  const font = await loadKoreanFont(`${title}${line}${grades}${footer}`, 'library/og')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: BG, color: FG, padding: 72, fontFamily: font ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, color: ACCENT }}>{grades}</div>
          <div style={{ fontSize: 58, lineHeight: 1.25, color: FG, marginTop: 20 }}>{title.slice(0, 60)}</div>
          <div style={{ fontSize: 28, lineHeight: 1.5, color: MUTED, marginTop: 24 }}>{line.slice(0, 90)}</div>
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
