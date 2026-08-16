import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import InsightCharts, { type GroupAvg } from './insight-charts'

export const dynamic = 'force-dynamic'

// post_performance 뷰 행 (필요한 컬럼만)
type PerfRow = {
  id: string
  content_code: string | null
  pattern: number | null
  hook_type: string | null
  closing_type: string | null
  views_1h: number | null
  views_24h: number | null
  replies_1h: number | null
  replies_24h: number | null
  reply_rate: number | null
  spread_multiple: number | null
  profile_clicks_24h: number | null
  had_self_reply: boolean | null
}

type Hypothesis = {
  code: string
  statement: string | null
  status: string | null
  support_count: number | null
  reject_count: number | null
}

const SAMPLE_MIN = 5

// reply_rate 평균을 그룹핑. null rate/키는 제외(키는 '미지정'으로 묶음).
function avgBy(rows: PerfRow[], key: 'pattern' | 'hook_type'): GroupAvg[] {
  const map = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    if (r.reply_rate == null) continue
    const raw = r[key]
    const label = raw == null || raw === '' ? '미지정' : String(raw)
    const e = map.get(label) ?? { sum: 0, n: 0 }
    e.sum += Number(r.reply_rate)
    e.n += 1
    map.set(label, e)
  }
  return [...map.entries()]
    .map(([label, { sum, n }]) => ({ label, avg: sum / n, n }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true }))
}

// 숫자 포맷 (null → '—')
const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
const f = (v: number | null | undefined, d = 3) =>
  v == null ? '—' : Number(v).toFixed(d)

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  supported: { bg: '#dcfce7', fg: '#166534', label: 'supported' },
  rejected: { bg: '#fee2e2', fg: '#991b1b', label: 'rejected' },
  testing: { bg: '#e0e7ff', fg: '#3730a3', label: 'testing' },
}

export default async function InsightsPage() {
  const supabase = await createClient()

  let rows: PerfRow[] = []
  let hypotheses: Hypothesis[] = []
  let postsCount = 0
  let loadError = ''

  if (!supabase) {
    loadError =
      'Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.'
  } else {
    const [perf, hy, cnt] = await Promise.all([
      supabase
        .from('post_performance')
        .select(
          'id, content_code, pattern, hook_type, closing_type, views_1h, views_24h, replies_1h, replies_24h, reply_rate, spread_multiple, profile_clicks_24h, had_self_reply',
        )
        .order('published_at', { ascending: false }),
      supabase
        .from('hypotheses')
        .select('code, statement, status, support_count, reject_count')
        .order('code'),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
    ])

    rows = (perf.data as PerfRow[] | null) ?? []
    hypotheses = (hy.data as Hypothesis[] | null) ?? []
    postsCount = cnt.count ?? 0

    const errs = [perf.error, hy.error, cnt.error].filter(Boolean)
    if (errs.length) loadError = errs.map(e => e!.message).join(' / ')
  }

  const patternData = avgBy(rows, 'pattern')
  const hookData = avgBy(rows, 'hook_type')

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: '2px solid #cbd5e1',
    whiteSpace: 'nowrap',
    fontSize: '0.8rem',
    color: '#475569',
  }
  const td: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
    fontSize: '0.85rem',
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 1200 }}>
      <p style={{ margin: '0 0 0.5rem' }}>
        <Link href="/dashboard">← 발행 기록 대시보드</Link>
      </p>
      <h1 style={{ margin: '0 0 1rem' }}>인사이트 대시보드</h1>

      {loadError && (
        <p style={{ color: 'red' }}>데이터 로드 오류: {loadError}</p>
      )}

      {/* 5) 표본 부족 안내 배너 */}
      {postsCount < SAMPLE_MIN && (
        <div
          style={{
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            margin: '0 0 1.5rem',
            color: '#713f12',
          }}
        >
          ⚠️ 표본이 쌓이는 중입니다. 5건 이상부터 패턴 비교가 유의미해집니다. (현재
          발행 {postsCount}건)
        </div>
      )}

      {/* 2·3) 차트 */}
      <section style={{ margin: '0 0 2rem' }}>
        <InsightCharts patternData={patternData} hookData={hookData} />
      </section>

      {/* 4) 가설 상태 요약 카드 */}
      <section style={{ margin: '0 0 2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>가설 상태 (H1~H7)</h2>
        {hypotheses.length === 0 ? (
          <p style={{ color: '#64748b' }}>가설 데이터가 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {hypotheses.map(h => {
              const s = STATUS_STYLE[h.status ?? ''] ?? {
                bg: '#f1f5f9',
                fg: '#475569',
                label: h.status ?? '—',
              }
              return (
                <div
                  key={h.code}
                  style={{
                    flex: '1 1 240px',
                    minWidth: 220,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <strong>{h.code}</strong>
                    <span
                      style={{
                        background: s.bg,
                        color: s.fg,
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#475569',
                      minHeight: 32,
                      marginBottom: 6,
                    }}
                  >
                    {h.statement ?? ''}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                    <span style={{ color: '#166534' }}>지지 {n(h.support_count)}</span>
                    {' · '}
                    <span style={{ color: '#991b1b' }}>반증 {n(h.reject_count)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 1) 발행 글 목록 테이블 */}
      <section>
        <h2 style={{ fontSize: '1.1rem' }}>발행 글 목록 ({rows.length}건)</h2>
        {rows.length === 0 ? (
          <p style={{ color: '#64748b' }}>
            아직 발행/성과 데이터가 없습니다. 대시보드에서 글을 등록하고 성과를 입력하면
            여기에 표시됩니다.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>content_code</th>
                  <th style={th}>pattern</th>
                  <th style={th}>hook_type</th>
                  <th style={th}>closing_type</th>
                  <th style={th}>views_1h</th>
                  <th style={th}>views_24h</th>
                  <th style={th}>replies_1h</th>
                  <th style={th}>replies_24h</th>
                  <th style={th}>reply_rate</th>
                  <th style={th}>spread_multiple</th>
                  <th style={th}>profile_clicks_24h</th>
                  <th style={th}>had_self_reply</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={td}>{r.content_code ?? '—'}</td>
                    <td style={td}>{n(r.pattern)}</td>
                    <td style={td}>{r.hook_type ?? '—'}</td>
                    <td style={td}>{r.closing_type ?? '—'}</td>
                    <td style={td}>{n(r.views_1h)}</td>
                    <td style={td}>{n(r.views_24h)}</td>
                    <td style={td}>{n(r.replies_1h)}</td>
                    <td style={td}>{n(r.replies_24h)}</td>
                    <td style={td}>{f(r.reply_rate)}</td>
                    <td style={td}>{f(r.spread_multiple, 2)}</td>
                    <td style={td}>{n(r.profile_clicks_24h)}</td>
                    <td style={td}>{r.had_self_reply == null ? '—' : r.had_self_reply ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
