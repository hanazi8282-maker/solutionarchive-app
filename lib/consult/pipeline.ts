// 컨설팅 파이프라인 — 라우트(웹)와 scripts/consult-scenario.mjs(승인 테스트)가 같은 코드를 쓴다. 장 단위 생성기를 불러 저장한다.
import { collectCompany } from './collect.ts'
import { buildCh1 } from './report/ch1.ts'
import { db, setStatus, type Run } from './runs.ts'

/** E0: 공개 페이지 수집 → consult_collected. 실패는 던진다(호출자가 status 를 failed 로). */
export async function collectAndStore(run: Run): Promise<void> {
  await setStatus(run.id, 'collecting')
  const facts = await collectCompany(run.company_url, run.one_liner)
  const { error } = await (await db()).from('consult_collected').upsert({ run_id: run.id, facts, thin: facts.thin })
  if (error) throw new Error(`수집 저장 실패: ${error.message}`)
  await setStatus(run.id, 'new')
}

/** 0층: 결론서 1장. 이미 있으면 다시 만들지 않는다(비용). 반환: 새로 만들었으면 true. */
export async function diagnoseLayer0(run: Run): Promise<boolean> {
  const sb = await db()
  const { data: have } = await sb.from('consult_diagnoses').select('id').eq('run_id', run.id).eq('layer', 0).maybeSingle()
  if (have) return false
  const { data: col } = await sb.from('consult_collected').select('facts,thin').eq('run_id', run.id).maybeSingle()
  const facts = (col?.facts ?? { pages: [] }) as { pages: { url: string; title: string; text: string }[] }
  try {
    await setStatus(run.id, 'diagnosing')
    const { ch, costUsd, model } = await buildCh1({
      runId: run.id, owner: run.owner_email, kind: run.kind, name: run.company_name,
      oneLiner: run.one_liner ?? '', pages: facts.pages, thin: Boolean(col?.thin ?? true),
    })
    const { error } = await sb.from('consult_diagnoses').upsert({ run_id: run.id, layer: 0, blocks: ch, model, cost_usd: costUsd }, { onConflict: 'run_id,layer' })
    if (error) throw new Error(`진단 저장 실패: ${error.message}`)
    await setStatus(run.id, 'done')
    return true
  } catch (e) {
    await setStatus(run.id, 'failed', e instanceof Error ? e.message.slice(0, 300) : 'diagnose failed')
    throw e
  }
}
