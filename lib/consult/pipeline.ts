// 컨설팅 파이프라인 — 라우트(웹)와 scripts/consult-scenario.mjs(승인 테스트)가 같은 코드를 쓴다. 장 단위 생성기를 불러 저장한다.
import { collectCompany } from './collect.ts'
import { buildCh1 } from './report/ch1.ts'
import { buildL1 } from './report/ch1-l1.ts'
import type { Ch1 } from './report/ch1-validate.ts'
import type { UserNumbers } from './report/ch1-l1-validate.ts'
import { buildCh2 } from './report/ch2.ts'
import type { Ch1L1 } from './report/ch1-l1-validate.ts'
import { retrieveSimilar } from './cases.ts'
import { runCostUsd } from './usage.ts'
import { db, setStatus, computeStage, type Run } from './runs.ts'

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
      stage: computeStage(run),
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

/** 1층 해금: 0층 진단 + 대표님 숫자 3개 → ⓐ 재계산 손실 ⓑ 후보 2+반박 ⓒ 벤치마크(보유 사례) ⓓ 메모 첫 문장. 이미 해금했으면 그대로 둔다. */
export async function unlockLayer1(run: Run, nums: UserNumbers, altMeans?: string): Promise<boolean> {
  const sb = await db()
  const { data: have } = await sb.from('consult_diagnoses').select('id').eq('run_id', run.id).eq('layer', 1).maybeSingle()
  if (have) return false
  const { data: l0 } = await sb.from('consult_diagnoses').select('blocks').eq('run_id', run.id).eq('layer', 0).maybeSingle()
  if (!l0) throw new Error('no_layer0')
  const ch1 = l0.blocks as Ch1
  const similar = await retrieveSimilar({ runId: run.id, owner: run.owner_email, category: ch1.position.category, oneLiner: run.one_liner ?? '' })
  const { l1, costUsd, model } = await buildL1({ runId: run.id, owner: run.owner_email, ch1, nums, similar, kind: run.kind, altMeans })
  const { error } = await sb.from('consult_diagnoses').upsert({ run_id: run.id, layer: 1, blocks: l1, model, cost_usd: costUsd }, { onConflict: 'run_id,layer' })
  if (error) throw new Error(`1층 저장 실패: ${error.message}`)
  await setStatus(run.id, 'done', null, 'l1')
  return true
}

/** 유료: 결론서 2장 결정 메모. 1층이 먼저 있어야 한다. 메모 1건 예산 ≤ $1.5 — 한 run 누적이 상한을 넘으면 만들지 않는다. */
export const RUN_COST_CAP_USD = 4
/** allowNoLayer1: 콜드메일 결론서처럼 대표님 숫자가 없을 때 0층만으로 메모를 만든다(웹 사용자 경로는 false). */
export async function generateMemo(run: Run, opts: { allowNoLayer1?: boolean } = {}): Promise<boolean> {
  const sb = await db()
  const { data: have } = await sb.from('consult_memos').select('id').eq('run_id', run.id).eq('version', 1).maybeSingle()
  if (have) return false
  const { data: ds } = await sb.from('consult_diagnoses').select('layer,blocks').eq('run_id', run.id)
  const l0 = ds?.find((d) => d.layer === 0)
  const l1 = ds?.find((d) => d.layer === 1)
  if (!l0 || (!l1 && !opts.allowNoLayer1)) throw new Error('no_layer1')
  if ((await runCostUsd(run.id)) > RUN_COST_CAP_USD) throw new Error('cost_cap')
  const { ch, costUsd, model } = await buildCh2({ runId: run.id, owner: run.owner_email, ch1: l0.blocks as Ch1, l1: (l1?.blocks ?? null) as Ch1L1 | null, kind: run.kind })
  const { error } = await sb.from('consult_memos').upsert({ run_id: run.id, version: 1, body: ch, first_sentence: ch.decision, model, cost_usd: costUsd }, { onConflict: 'run_id,version' })
  if (error) throw new Error(`메모 저장 실패: ${error.message}`)
  await setStatus(run.id, 'done', null, 'paid')
  return true
}
