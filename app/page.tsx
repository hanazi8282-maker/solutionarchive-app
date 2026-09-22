import { redirect } from 'next/navigation'
import { Badge } from './_ds/components/Badge'
import { ButtonLink } from './_ds/components/Button'
import { Card } from './_ds/components/Card'
import { PageShell, StatGrid, StatTile } from './_ds/components/Shell'
import { getAuthVerdict } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { READER_PROBLEM_LABEL, READER_PROBLEMS } from '@/lib/cases/draft'

// 로그인 안 한 방문자가 보는 첫 화면. 전에는 `/dashboard` 로 redirect 만 했고, 그 리디렉트는
// 로그인 벽에 막혀 외부 방문자에게는 빈손이었다.
//
// ⚠️ 이 라우트 하나만 공개다. 판정은 lib/auth/policy.ts 의 PUBLIC_EXACT(정확일치) —
//    접두사 목록에는 넣지 않았다. scripts/auth-selftest.mjs 가 양성(`/`)·음성(그 밖)을 같이 본다.

// 정적 프리렌더 금지. 이 화면은 (1) 로그인 여부로 갈리고 (2) 축적량을 DB 에서 읽는다 —
// 빌드 시점에 굳으면 로그인한 사람이 랜딩에 머물고, 숫자는 배포 시각에 멈춘다.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'SaaS 1인 창업가를 위한 사례 아카이브',
  description:
    '내 문제와 비슷한 상황을 겪은 SaaS 사례가 그걸 어떻게 풀었는지, 근거 등급과 함께 본다.',
}

/**
 * 첫 화면에 적는 축적량. §7.1 — 못 읽은 것을 0 으로 접지 않는다.
 * 하나라도 확인 불가면 null 을 돌려주고 화면은 숫자 없이 "축적 중"이라고만 쓴다.
 */
async function loadCounts(): Promise<{ cases: number; failures: number } | null> {
  const sb = await createClient()
  if (!sb) return null
  const [cases, failures] = await Promise.all([
    sb.from('case_studies').select('id', { count: 'exact', head: true }).eq('review_status', 'approved'),
    sb.from('failed_angles').select('id', { count: 'exact', head: true }),
  ])
  if (cases.error || failures.error || cases.count == null || failures.count == null) {
    console.error('[landing] count unavailable:',
      cases.error?.message ?? '', failures.error?.message ?? '')
    return null
  }
  return { cases: cases.count, failures: failures.count }
}

/** "어떻게 다른가" 3가지. 기능 자랑이 아니라 이 아카이브가 실제로 거는 제약이다. */
const DIFFERENCES = [
  {
    title: '근거 등급 A/B/C/D 를 숨기지 않는다',
    body: '사례마다 등급이 붙는다. 공시·감사받은 수치인지, 창업자가 자기 블로그에서 말한 숫자인지 카드에서 구분된다. 등급이 낮은 사례를 지우는 대신 낮다고 적는다.',
  },
  {
    title: '실패한 시도를 같이 낸다',
    body: '통한 것만 모으면 이미 깨진 길로 다시 간다. 같은 병목에서 무너진 시도를 빨간 카드로 함께 보여준다.',
  },
  {
    title: '내일 할 행동 1개로 끝난다',
    body: '사례마다 전제 조건과 "내 상황으로 옮기면 무엇이 달라지나"가 붙는다. 읽고 덮는 글이 아니라 하나 골라 실행하는 자리다.',
  },
]

export default async function Home() {
  // 로그인한 사람에게 랜딩은 볼 이유가 없는 화면이다 — 종전대로 작업 화면으로 보낸다.
  const verdict = await getAuthVerdict()
  if (verdict.kind === 'allowed') redirect('/dashboard')

  const counts = await loadCounts()

  return (
    <PageShell maxWidth={760}>
      {/* 히어로는 내용 크기만 차지한다(100vh 금지) — 첫 스크롤 전에 문제 목록까지 보여야 한다. */}
      <header style={{ display: 'grid', gap: 14, paddingTop: 8 }}>
        <h1 style={{
          margin: 0, fontSize: 'clamp(24px, 4.2vw, 34px)', fontWeight: 'var(--fw-bold)',
          letterSpacing: 'var(--ls-tight)', lineHeight: 1.35, color: 'var(--text-strong)',
        }}>
          내 문제와 비슷한 상황을 겪은 SaaS 사례가 그걸 어떻게 풀었는지, 근거 등급과 함께.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)' }}>
          만들 줄은 아는데 그걸 돈으로 바꾸는 법을 모르는 1인 창업가를 위해 모은다.
        </p>
      </header>

      <Card
        title="지금 무엇에 막혀 있나"
        subtitle="이 7가지가 사례를 고르는 1순위 축이다. 브랜드 이름이나 규모보다 이 축이 먼저다."
      >
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          {/* 어휘·라벨 정본은 config/reader-problems.json 이다. 여기서 문구를 다시 적지 않는다. */}
          {READER_PROBLEMS.map((code) => (
            <li key={code}>
              <Badge tone="neutral" style={{ whiteSpace: 'normal', height: 'auto', padding: '6px 12px', lineHeight: 1.5 }}>
                {READER_PROBLEM_LABEL[code]}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>어떻게 다른가</h2>
        {DIFFERENCES.map((d) => (
          <Card key={d.title} title={d.title}>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-body)' }}>
              {d.body}
            </p>
          </Card>
        ))}
      </section>

      {/* 정직한 상태 표시. 숫자를 못 읽으면 0 이 아니라 "축적 중" 이다(§7.1). */}
      <StatGrid min={200}>
        <StatTile
          label="승인된 케이스"
          value={counts ? `${counts.cases}건` : '축적 중'}
          caption={counts ? '사람이 사실확인·이식성까지 본 것만 센다' : '건수 확인 불가 — 0건이라는 뜻이 아니다'}
        />
        <StatTile
          label="실패 사례"
          value={counts ? `${counts.failures}건` : '축적 중'}
          caption={counts ? '무엇이 왜 안 됐는지 남긴 원장' : '건수 확인 불가 — 0건이라는 뜻이 아니다'}
        />
      </StatGrid>

      {/* CTA 는 하나. 라벨을 "베타 신청"으로 적지 않는다 — 신청 폼이 없고, 지금 할 수 있는 건
          초대받은 계정으로 로그인하는 것뿐이다(없는 창구를 약속하지 않는다). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <ButtonLink href="/login" variant="primary" size="lg">로그인</ButtonLink>
      </div>

      <footer style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.6, color: 'var(--text-muted)' }}>
        허용목록 베타 — 초대된 Google 계정만 들어올 수 있다. 목록에 없는 계정은 로그인 화면에서 거절된다.
        베타 신청 창구는 아직 열지 않았다.
      </footer>
    </PageShell>
  )
}
