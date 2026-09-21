'use client'

import { useEffect, useState } from 'react'
import { Badge } from '../../../_ds/components/Badge'
import { Button, ButtonLink } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import type { RemedyCard, RemedyResult } from '@/lib/cases/remedy'
import { failureLine, fixLine, principleLine } from '@/lib/cases/remedy'

// ── 문제 해결 제안 (산출물 C, §3-1 6) ──────────────────────────────
// 페인 속성마다 "이렇게 보완한 사례 / 이렇게 갔다가 막힌 사례 / 원칙" 한 장.
// 문장 템플릿은 lib/cases/remedy.ts 한 곳이다 — 요약 마크다운과 이 화면이 갈라지지 않게.
// 여기서 그 문자열을 자르거나 다시 조립하지 않는다(셀프테스트가 고정하는 문장이다).
//
// 3상태를 문장으로 가른다: 근거 있음 / 관련 사례 없음 / 확인 불가. 0건을 "아직 없음" 으로 뭉개지 않는다.
//
// 색은 **유형**이다(docs/ui-redesign-plan-2026-09-21.md B-4): 보완=브랜드 보라 · 막힘=빨강 ·
// 원칙=회색. 초록은 쓰지 않는다 — 초록이 "이대로 하면 된다" 로 읽히는데, 전부 권고일 뿐이다.

const muted: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 'var(--lh-normal)' }
const body: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)', lineHeight: 'var(--lh-normal)', overflowWrap: 'anywhere' }

// estimate: failed_angles.is_estimate — 재서술에 인과 해석·추정이 섞인 행. 어드바이저 카드와 같은 "추정" 배지다.
function Line({ text, low, tone, estimate }: { text: string; low: boolean; tone?: 'danger'; estimate?: boolean }) {
  return (
    <li style={{ ...body, color: tone === 'danger' ? 'var(--danger-fg)' : 'var(--text-body)' }}>
      {text}
      {estimate && <> <Badge tone="warning" size="sm">추정</Badge></>}
      {low && <> <Badge tone="warning" size="sm">신뢰도 낮음</Badge></>}
    </li>
  )
}

/** 유형 한 묶음. 제목·왼쪽 띠 색이 유형을 말한다 — 등급이나 감성이 아니다. */
function Group({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      <div className="dgy-caps" style={{ color }}>{label}</div>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>{children}</ul>
    </div>
  )
}

/** 근거 등급 순 = 근거가 붙은 카드부터. 확인 불가를 "사례 없음" 뒤로 두지 않는다. */
const STATUS_RANK: Record<RemedyCard['status'], number> = { matched: 0, no_match: 1, not_run: 2 }

export function RemedySection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RemedyResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // 'impact' = 서버가 준 순서(판정 PUSH → WATCH). 'grade' = 근거가 붙은 카드부터.
  const [sort, setSort] = useState<'impact' | 'grade'>('impact')

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

  const cards = data == null
    ? []
    : sort === 'impact'
      ? data.cards
      : [...data.cards].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])

  return (
    <Card
      title="무엇을 먼저 고칠까"
      subtitle="판정이 “여기를 민다”·“지켜본다” 인 속성마다, 비슷한 문제를 푼 선례와 같은 소구점으로 막힌 사례를 붙인다."
      action={cards.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button variant={sort === 'impact' ? 'primary' : 'outline'} size="sm" aria-pressed={sort === 'impact'} onClick={() => setSort('impact')}>
            영향 큰 순
          </Button>
          <Button variant={sort === 'grade' ? 'primary' : 'outline'} size="sm" aria-pressed={sort === 'grade'} onClick={() => setSort('grade')}>
            근거 등급 순
          </Button>
        </div>
      ) : null}
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
            {cards.map((c) => {
              const lowCount = [...c.fixes, ...c.failures, ...c.principles].filter((x) => x.low_confidence).length
              const estimateCount = c.failures.filter((f) => f.is_estimate).length
              return (
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
                      <Group label="이렇게 보완한 사례" color="var(--brand)">
                        {c.fixes.map((f) => <Line key={f.case_move_id} text={fixLine(f)} low={f.low_confidence} />)}
                      </Group>
                    )}
                    {c.failures.length > 0 && (
                      <Group label="이렇게 갔다가 막힌 사례" color="var(--sent-neg)">
                        {c.failures.map((f) => <Line key={f.case_key} text={failureLine(f)} low={f.low_confidence} tone="danger" estimate={f.is_estimate} />)}
                      </Group>
                    )}
                    {c.principles.length > 0 && (
                      <Group label="원칙" color="var(--sent-neutral)">
                        {c.principles.map((p) => <Line key={p.sp_id} text={principleLine(p)} low={p.low_confidence} />)}
                      </Group>
                    )}
                    {/* 왜 이 사례가 나왔나 — 겹친 낱말과 배지 뜻을 한 자리에 접어 둔다 (SP-024). */}
                    <details className="dgy-details">
                      <summary>매칭 근거</summary>
                      <div style={{ display: 'grid', gap: 4, padding: '6px 0 0' }}>
                        <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                          겹친 낱말 · {c.terms.slice(0, 6).map((t) => `“${t}”`).join(', ')}
                        </p>
                        {lowCount > 0 && (
                          <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                            “신뢰도 낮음” {lowCount}건 — 겹친 낱말이 하나뿐입니다. 이 낱말이 우연히 겹친 것은 아닌지 직접 확인하세요.
                          </p>
                        )}
                        {estimateCount > 0 && (
                          <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                            “추정” {estimateCount}건 — 재서술에 인과 해석·추정이 섞인 행입니다. 원 기록이 그렇게 말한 것은 아닙니다.
                          </p>
                        )}
                      </div>
                    </details>
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
              )
            })}
          </div>
        )
      )}
    </Card>
  )
}
