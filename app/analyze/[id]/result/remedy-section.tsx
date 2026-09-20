'use client'

import { useEffect, useState } from 'react'
import { Badge } from '../../../_ds/components/Badge'
import { ButtonLink } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import type { RemedyResult } from '@/lib/cases/remedy'
import { failureLine, fixLine, principleLine } from '@/lib/cases/remedy'

// ── 문제 해결 제안 (산출물 C, §3-1 6) ──────────────────────────────
// 페인 속성마다 "이렇게 보완한 사례 / 이렇게 갔다가 막힌 사례 / 원칙" 한 장.
// 문장 템플릿은 lib/cases/remedy.ts 한 곳이다 — 요약 마크다운과 이 화면이 갈라지지 않게.
//
// 3상태를 문장으로 가른다: 근거 있음 / 관련 사례 없음 / 확인 불가. 0건을 "아직 없음" 으로 뭉개지 않는다.

const muted: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 'var(--lh-normal)' }
const body: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)', lineHeight: 'var(--lh-normal)', overflowWrap: 'anywhere' }

function Line({ text, low, tone }: { text: string; low: boolean; tone?: 'danger' }) {
  return (
    <li style={{ ...body, color: tone === 'danger' ? 'var(--danger-fg)' : 'var(--text-body)' }}>
      {text}
      {low && <> <Badge tone="warning" size="sm">신뢰도 낮음</Badge></>}
    </li>
  )
}

export function RemedySection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RemedyResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`/api/analyze/remedy?project_id=${encodeURIComponent(projectId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) setError(json.error ?? '문제 해결 제안을 불러오지 못했습니다.')
        else setData(json.remedies as RemedyResult)
      })
      .catch(() => { if (alive) setError('네트워크 오류가 발생했습니다.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  return (
    <Card
      title="문제 해결 제안"
      subtitle="판정이 “여기를 민다”·“지켜본다” 인 속성마다, 비슷한 문제를 푼 선례와 같은 소구점으로 막힌 사례를 붙인다."
    >
      {loading && <p role="status" style={muted}>찾는 중…</p>}
      {error && <p role="alert" style={{ ...muted, color: 'var(--danger-fg)' }}>{error} — 제안이 없다는 뜻이 아닙니다.</p>}

      {!loading && !error && data && (
        data.cards.length === 0 ? (
          <p style={muted}>
            {data.status === 'not_run' ? `확인 불가 — ${data.reason}` : `관련 사례 없음 — 억지로 끼워 맞추지 않는다. (${data.reason})`}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {data.cards.map((c) => (
              <div key={c.aspect_id} style={{
                display: 'grid', gap: 8, padding: '12px 14px',
                background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <Badge tone={c.verdict.code === 'PUSH' ? 'danger' : 'warning'} size="sm">{c.verdict.label}</Badge>
                  <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-strong)' }}>{c.headline}</strong>
                </div>

                {c.status !== 'matched' ? (
                  <p style={muted}>
                    {c.status === 'no_match'
                      ? '관련 사례 없음 — 억지로 끼워 맞추지 않는다.'
                      : `확인 불가 — ${c.reason}`}
                  </p>
                ) : (
                  <>
                    {c.fixes.length > 0 && (
                      <div>
                        <div className="dgy-caps">이렇게 보완한 사례</div>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                          {c.fixes.map((f) => <Line key={f.case_move_id} text={fixLine(f)} low={f.low_confidence} />)}
                        </ul>
                      </div>
                    )}
                    {c.failures.length > 0 && (
                      <div>
                        <div className="dgy-caps">이렇게 갔다가 막힌 사례</div>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                          {c.failures.map((f) => <Line key={f.case_key} text={failureLine(f)} low={f.low_confidence} tone="danger" />)}
                        </ul>
                      </div>
                    )}
                    {c.principles.length > 0 && (
                      <div>
                        <div className="dgy-caps">원칙</div>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                          {c.principles.map((p) => <Line key={p.sp_id} text={principleLine(p)} low={p.low_confidence} />)}
                        </ul>
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                      매칭 근거 · {c.terms.slice(0, 6).map((t) => `“${t}”`).join(', ')}
                    </p>
                  </>
                )}

                <ButtonLink
                  href={`/analyze/${projectId}/angles#aspect-${c.aspect_id}`}
                  variant="outline"
                  size="sm"
                  fullWidth
                >
                  이 속성으로 앵글 만들기 →
                </ButtonLink>
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  )
}
