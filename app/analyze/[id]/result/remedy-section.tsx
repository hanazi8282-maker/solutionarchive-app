'use client'

import { useEffect, useState } from 'react'
import { Badge } from '../../../_ds/components/Badge'
import { Button, ButtonLink } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import type { GatedRemedyCard, GatedRemedyResult } from '@/lib/cases/remedy-gate'
import { failureLine, fixLine, principleLine } from '@/lib/cases/remedy'

// ── 문제 해결 제안 (산출물 C, §3-1 6) ──────────────────────────────
// 페인 속성마다 "이렇게 보완한 사례 / 이렇게 갔다가 막힌 사례 / 원칙" 한 장.
// 문장 템플릿은 lib/cases/remedy.ts 한 곳이다 — 요약 마크다운과 이 화면이 갈라지지 않게.
// 여기서 그 문자열을 자르거나 다시 조립하지 않는다(셀프테스트가 고정하는 문장이다).
//
// 3상태를 문장으로 가른다: 근거 있음 / 관련 사례 없음 / 확인 불가. 0건을 "아직 없음" 으로 뭉개지 않는다.
//
// 재검사(게이트, lib/cases/remedy-gate.ts): 낱말로 걸린 카드를 LLM 이 다시 보고 "무관" 이면 뺀다.
// 그 결과를 속성마다 한 줄로 밝힌다 — 몇 장이 통과하고 몇 장이 빠졌는지 안 보이면 남은 카드의 뜻이 달라진다.
// **판정을 못 받은 카드는 숨기지 않는다.** "미검증" 배지를 달아 그대로 둔다(§7.1 — 확인 불가 ≠ 관련 없음).
//
// 색은 **유형**이다(docs/ui-redesign-plan-2026-09-21.md B-4): 보완=브랜드 보라 · 막힘=빨강 ·
// 원칙=회색. 초록은 쓰지 않는다 — 초록이 "이대로 하면 된다" 로 읽히는데, 전부 권고일 뿐이다.


// estimate: failed_angles.is_estimate — 재서술에 인과 해석·추정이 섞인 행. 어드바이저 카드와 같은 "추정" 배지다.
// unverified: 관련성 재검사를 못 받은 카드(판정 실패·아직 안 돌림). 빼지 않고 표시만 한다.
// 막힌 사례 줄은 글자색을 바꾸지 않는다 — v2 코랄은 글자 대비가 안 나와, 묶음의 코랄 왼쪽 띠가 뜻을 말한다.
function Line({ text, low, estimate, unverified }: {
  text: string; low: boolean; estimate?: boolean; unverified?: boolean
}) {
  return (
    <li className="v2-text">
      {text}
      {estimate && <> <Badge tone="warning" size="sm">추정</Badge></>}
      {low && <> <Badge tone="warning" size="sm">신뢰도 낮음</Badge></>}
      {unverified && <> <Badge tone="neutral" size="sm">미검증</Badge></>}
    </li>
  )
}

// 클래스 이름을 문자열로 조립하지 않는다 — 겹침 검사가 v2.css 에 있는지 셀 수 있게 전체 이름으로 둔다.
const GROUP_CLASS = { fix: 'v2-group v2-group--fix', fail: 'v2-group v2-group--fail', principle: 'v2-group v2-group--principle' } as const

/** 유형 한 묶음. 왼쪽 띠 색이 유형을 말한다(글자는 잉크) — 등급이나 감성이 아니다. */
function Group({ label, kind, children }: { label: string; kind: 'fix' | 'fail' | 'principle'; children: React.ReactNode }) {
  return (
    <div className={GROUP_CLASS[kind]}>
      <div className="dgy-caps">{label}</div>
      <ul className="v2-olist v2-mt-xs">{children}</ul>
    </div>
  )
}

/** 근거 등급 순 = 근거가 붙은 카드부터. 확인 불가를 "사례 없음" 뒤로 두지 않는다. */
const STATUS_RANK: Record<GatedRemedyCard['status'], number> = { matched: 0, no_match: 1, not_run: 2 }

export function RemedySection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<GatedRemedyResult | null>(null)
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
        else setData(json.remedies as GatedRemedyResult)
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
        <div className="v2-chiprow">
          <Button variant={sort === 'impact' ? 'primary' : 'outline'} size="sm" aria-pressed={sort === 'impact'} onClick={() => setSort('impact')}>
            영향 큰 순
          </Button>
          <Button variant={sort === 'grade' ? 'primary' : 'outline'} size="sm" aria-pressed={sort === 'grade'} onClick={() => setSort('grade')}>
            근거 등급 순
          </Button>
        </div>
      ) : null}
    >
      {loading && <p role="status" className="v2-text v2-text--muted">찾는 중…</p>}
      {error && <p role="alert" className="v2-danger-text">{error} — 제안이 없다는 뜻이 아닙니다.</p>}

      {!loading && !error && data && (
        data.cards.length === 0 ? (
          <p className="v2-text v2-text--muted">
            {data.status === 'not_run' ? `확인 불가 — ${data.reason}` : `관련 사례 없음 — 억지로 끼워 맞추지 않는다. (${data.reason})`}
          </p>
        ) : (
          <div className="v2-stack-lg">
            {cards.map((c) => {
              const lowCount = [...c.fixes, ...c.failures, ...c.principles].filter((x) => x.low_confidence).length
              const estimateCount = c.failures.filter((f) => f.is_estimate).length
              const g = c.gate_summary
              // 재검사 캡션은 "본 카드가 있었을 때"만 낸다. 낱말 단계에서 0장이면 잴 것이 없다.
              const gateCaption = g && g.judged + g.unverified > 0
                ? `재검사: ${g.judged - g.removed}장 통과 · ${g.removed}장 제외 · ${g.unverified}장 미검증`
                : null
              return (
              <div key={c.aspect_id} className="v2-box v2-box--edge v2-box--roomy">
                <div className="v2-chiprow">
                  <Badge tone={c.verdict.code === 'PUSH' ? 'danger' : 'warning'} size="sm">{c.verdict.label}</Badge>
                  <strong className="v2-lead">{c.headline}</strong>
                </div>

                {c.status !== 'matched' ? (
                  <>
                    <p className="v2-text v2-text--muted">
                      {c.status === 'no_match'
                        ? '관련 사례 없음 — 억지로 끼워 맞추지 않는다.'
                        : `확인 불가 — ${c.reason}`}
                    </p>
                    {/* 낱말로는 걸렸는데 재검사에서 전부 빠진 경우다. 그 사실을 감추면 "원래 없었다" 로 읽힌다. */}
                    {gateCaption && <p className="v2-note">{gateCaption}</p>}
                  </>
                ) : (
                  <>
                    {gateCaption && <p className="v2-note">{gateCaption}</p>}
                    {c.fixes.length > 0 && (
                      <Group label="이렇게 보완한 사례" kind="fix">
                        {c.fixes.map((f) => <Line key={f.case_move_id} text={fixLine(f)} low={f.low_confidence} unverified={f.gate === 'unverified'} />)}
                      </Group>
                    )}
                    {c.failures.length > 0 && (
                      <Group label="이렇게 갔다가 막힌 사례" kind="fail">
                        {c.failures.map((f) => <Line key={f.case_key} text={failureLine(f)} low={f.low_confidence} estimate={f.is_estimate} unverified={f.gate === 'unverified'} />)}
                      </Group>
                    )}
                    {c.principles.length > 0 && (
                      <Group label="원칙" kind="principle">
                        {c.principles.map((p) => <Line key={p.sp_id} text={principleLine(p)} low={p.low_confidence} unverified={p.gate === 'unverified'} />)}
                      </Group>
                    )}
                    {/* 왜 이 사례가 나왔나 — 겹친 낱말과 배지 뜻을 한 자리에 접어 둔다 (SP-024). */}
                    <details className="dgy-details">
                      <summary>매칭 근거</summary>
                      <div className="v2-stack-tight v2-pt">
                        <p className="v2-note">
                          겹친 낱말 · {c.terms.slice(0, 6).map((t) => `“${t}”`).join(', ')}
                        </p>
                        {lowCount > 0 && (
                          <p className="v2-note">
                            “신뢰도 낮음” {lowCount}건 — 겹친 낱말이 하나뿐입니다. 이 낱말이 우연히 겹친 것은 아닌지 직접 확인하세요.
                          </p>
                        )}
                        {g && g.unverified > 0 && (
                          <p className="v2-note">
                            “미검증” {g.unverified}건 — 관련성 재검사를 받지 못한 카드입니다. 무관하다는 뜻이 아니라 아직 판정이 없다는 뜻입니다.
                          </p>
                        )}
                        {estimateCount > 0 && (
                          <p className="v2-note">
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
