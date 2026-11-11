// POST /api/consult/runs/<id>/diagnose — R3 0층 무료 진단(= 결론서 1장). 이미 만든 진단이 있으면 다시 부르지 않는다(비용).
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { db, getRun, setStatus } from '@/lib/consult/runs'
import { buildCh1 } from '@/lib/consult/report/ch1'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}`, req.url), 303)

  const sb = await db()
  const { data: have } = await sb.from('consult_diagnoses').select('id').eq('run_id', id).eq('layer', 0).maybeSingle()
  if (have) return to()
  if (run.status === 'diagnosing') return to('?busy=1')

  const { data: col } = await sb.from('consult_collected').select('facts,thin').eq('run_id', id).maybeSingle()
  const facts = (col?.facts ?? { pages: [] }) as { pages: { url: string; title: string; text: string }[] }
  try {
    await setStatus(id, 'diagnosing')
    const { ch, costUsd, model } = await buildCh1({
      runId: id, owner: auth.email, kind: run.kind, name: run.company_name,
      oneLiner: run.one_liner ?? '', pages: facts.pages, thin: Boolean(col?.thin ?? true),
    })
    const { error } = await sb.from('consult_diagnoses').upsert({ run_id: id, layer: 0, blocks: ch, model, cost_usd: costUsd }, { onConflict: 'run_id,layer' })
    if (error) throw new Error(`진단 저장 실패: ${error.message}`)
    await setStatus(id, 'done')
  } catch (e) {
    await setStatus(id, 'failed', e instanceof Error ? e.message.slice(0, 300) : 'diagnose failed')
  }
  return to()
}
