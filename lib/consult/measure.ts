// R8 측정카드 생성 — ROI 모드는 코드만(목표는 대표님이 정함), 몰랐던 사실 모드는 Sonnet 이 수집 사실·진단에서 뽑되 출처를 강제한다.
import { consultLlmJson } from './llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { db, type Run } from './runs.ts'
import { buildRoiCard, pickMode, validateUnknownFacts, type Mode } from './measure-validate.ts'
import type { Ch1L1 } from './report/ch1-l1-validate.ts'

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 대표님이 스스로 적지 않았을 법한 사실(몰랐던 사실)을 1~3개 뽑습니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체. 각 사실은 130자 이하, 반드시 출처가 있어야 합니다(수집한 페이지 주소, 사례 이름, 또는 진단 항목 이름). 출처를 댈 수 없는 것은 쓰지 않습니다. 추측은 사실이 아닙니다.
출력은 JSON 객체 하나만: {"facts":[{"fact":"","source":""}]}`

/** 카드 1장(run 당 하나). 이미 있으면 만들지 않는다. 반환: 새로 만들었는지. */
export async function createMeasureCard(run: Run, form: { target?: unknown; due?: unknown }): Promise<{ created: boolean; mode: Mode }> {
  const sb = await db()
  const { data: have } = await sb.from('consult_measure_cards').select('id,mode').eq('run_id', run.id).maybeSingle()
  if (have) return { created: false, mode: have.mode as Mode }
  const { data: ds } = await sb.from('consult_diagnoses').select('layer,blocks').eq('run_id', run.id)
  const l0 = ds?.find((d) => d.layer === 0)
  if (!l0) throw new Error('no_layer0')
  const l1 = (ds?.find((d) => d.layer === 1)?.blocks ?? null) as Ch1L1 | null
  const mode = pickMode(run, Boolean(l1))

  if (mode === 'roi' && l1) {
    const c = buildRoiCard(l1.inputs.rate_pct, form.target, form.due)
    const { error } = await sb.from('consult_measure_cards').insert({
      run_id: run.id, mode, title: '전환율 측정카드', metric_name: c.metric_name, baseline: c.baseline, target: c.target, due_date: c.due_date, body: { statement: c.statement },
    })
    if (error) throw new Error(`측정카드 저장 실패: ${error.message}`)
    return { created: true, mode }
  }

  const { data: col } = await sb.from('consult_collected').select('facts').eq('run_id', run.id).maybeSingle()
  const pages = ((col?.facts ?? { pages: [] }) as { pages: { url: string; title: string; text: string }[] }).pages
  const user = `진단(0층): ${JSON.stringify(l0.blocks).slice(0, 2500)}\n\n수집한 사실:\n${pages.map((p) => `[${p.url}] ${p.title}\n${p.text.slice(0, 1200)}`).join('\n\n')}\n\n대표님의 한 줄 설명: ${(run.one_liner ?? '').slice(0, 300)}`
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: run.id, owner: run.owner_email, purpose: 'measure', tag: 'sonnet', system: SYSTEM, user: user + feedback, maxTokens: 800 })
      const facts = validateUnknownFacts(r.data)
      const { error } = await sb.from('consult_measure_cards').insert({ run_id: run.id, mode, title: '몰랐던 사실 카드', body: { facts } })
      if (error) throw new Error(`측정카드 저장 실패: ${error.message}`)
      return { created: true, mode }
    } catch (e) {
      // ch1.ts 와 같은 수정: consultLlmJson 의 JSON 파싱 실패도 재시도 대상이어야 한다.
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
