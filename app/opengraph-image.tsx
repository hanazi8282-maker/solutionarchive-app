import { ImageResponse } from 'next/og'
import { loadKoreanFont } from '@/lib/og/korean-font'

// 랜딩(`/`) 링크 미리보기 이미지. 선례는 app/api/onboarding/quiz/share/route.tsx —
// next/og 는 Next 내장이라 신규 의존성이 0 이고, 한글 폰트 로딩 우회도 같은 함수를 쓴다.
//
// ⚠️ 이 라우트(`/opengraph-image`)도 공개다(lib/auth/policy.ts PUBLIC_EXACT). 미리보기 크롤러는
//    익명이라 막으면 이미지가 영영 안 뜬다. DB 를 읽지 않는 고정 문구라 새는 데이터가 없다.

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '솔루션아카이브 — 한국 업무용 AI 소프트웨어 팀을 위한 결론서'

const BG = '#0b0f19'
const FG = '#f8fafc'
// violet-400 — 앱 브랜드(보라)와 맞춘다. OG 이미지는 CSS 변수를 못 읽어 값을 박아야 한다.
const ACCENT = '#a78bfa'
const MUTED = '#94a3b8'

const HEADLINE = '경쟁 제품의 고객 글을 대조해\n만드는 결론서'
const SUB = '회의·통화 기록 · 영업 · 마케팅 · 인사 운영 · 리뷰 관리'
const BRAND = 'SOLUTION ARCHIVE'

export default async function OpengraphImage() {
  const font = await loadKoreanFont(`${HEADLINE}${SUB}${BRAND}`, 'opengraph-image')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
          background: BG,
          color: FG,
          fontFamily: font ? 'NotoKR' : 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, color: ACCENT, letterSpacing: 4 }}>{BRAND}</div>
        {/* whiteSpace: pre-wrap — Satori 는 자동 줄바꿈 위치를 잡아 주지 않아 줄을 직접 끊는다. */}
        <div style={{ fontSize: 62, lineHeight: 1.35, marginTop: 28, whiteSpace: 'pre-wrap' }}>{HEADLINE}</div>
        <div style={{ fontSize: 34, color: MUTED, marginTop: 32 }}>{SUB}</div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'NotoKR', data: font, weight: 700, style: 'normal' }] : undefined,
    },
  )
}
