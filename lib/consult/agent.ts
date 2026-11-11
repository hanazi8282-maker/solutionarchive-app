// R7 에이전트 — 진단·메모를 근거로 질문에 답한다. 도구 호출은 JSON 프로토콜(프로바이더 무관), 최대 MAX_STEPS 단계, 한 턴 예산 ≈ $0.05(Sonnet).
// 도구: search_cases(보유 사례 조회) · recalc_loss(내 숫자로 손실 재계산 — 곱셈은 코드) · show_memo(저장된 결정 메모 조회).
import { consultLlmJson } from './llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { db, type Run } from './runs.ts'
import { MAX_STEPS, parseStep, recalcLoss, validateToolArgs, type ToolName } from './agent-validate.ts'
import { CATEGORIES, MECHANISMS, caseLine, type CaseRow } from './cases-validate.ts'

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 저장된 진단과 결정 메모를 근거로 대표님의 질문에 답합니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 권고는 "~하세요", 별명·농담 금지, "90일 재측정" 금지. 근거 없는 사실·숫자를 지어내지 않고 모르면 모른다고 합니다. 답은 400자 이내.
사용할 수 있는 도구(필요할 때만, 한 번에 하나):
- search_cases: {"category":"${CATEGORIES.join('|')}","mechanism":"${MECHANISMS.join('|')}"} 중 하나 이상 — 보유 사례(비슷한 회사) 조회
- recalc_loss: {"audience":숫자,"rate_pct":숫자,"value_man":숫자,"leak_low":0~1,"leak_high":0~1} — 손실 재계산(곱셈은 시스템이 합니다)
- show_memo: {} — 저장된 결정 메모 보기
출력은 JSON 객체 하나만: 도구가 필요하면 {"tool":"이름","args":{...}}, 답할 수 있으면 {"final":"답변"}.`

async function runTool(tool: ToolName, args: Record<string, unknown>, run: Run): Promise<unknown> {
  const sb = await db()
  if (tool === 'search_cases') {
    const { data } = await sb.rpc('case_retrieve', { p_category: args.category, p_mechanism: args.mechanism, p_outcome: null, p_decision_keyword: null, p_limit: 6 })
    return ((data ?? []) as CaseRow[]).map(caseLine).filter(Boolean).slice(0, 3)
  }
  if (tool === 'recalc_loss') return recalcLoss(args as Parameters<typeof recalcLoss>[0])
  const { data } = await sb.from('consult_memos').select('body').eq('run_id', run.id).eq('version', 1).maybeSingle()
  return data?.body ?? { error: '저장된 결정 메모가 없습니다.' }
}

export async function chatTurn(run: Run, userMessage: string): Promise<string> {
  const sb = await db()
  const msg = userMessage.trim().slice(0, 800)
  const { data: ds } = await sb.from('consult_diagnoses').select('layer,blocks').eq('run_id', run.id)
  const { data: hist } = await sb.from('consult_messages').select('role,content').eq('run_id', run.id).order('id', { ascending: false }).limit(8)
  const context = `진단(0층): ${JSON.stringify(ds?.find((d) => d.layer === 0)?.blocks ?? null).slice(0, 2500)}\n1층: ${JSON.stringify(ds?.find((d) => d.layer === 1)?.blocks ?? null).slice(0, 2500)}`
  const history = (hist ?? []).reverse().map((m) => `${m.role === 'user' ? '대표님' : '컨설턴트'}: ${m.content}`).join('\n')
  await sb.from('consult_messages').insert({ run_id: run.id, role: 'user', content: msg })

  let scratch = ''
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await consultLlmJson({ runId: run.id, owner: run.owner_email, purpose: 'chat', tag: 'sonnet', system: SYSTEM, user: `${context}\n\n지금까지 대화:\n${history}\n\n대표님 질문: ${msg}${scratch}`, maxTokens: 1200 })
    const s = parseStep(r.data)
    if (s.kind === 'final') {
      await sb.from('consult_messages').insert({ run_id: run.id, role: 'assistant', content: s.text })
      return s.text
    }
    let result: unknown
    try {
      result = await runTool(s.tool, validateToolArgs(s.tool, s.args), run)
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) }
    }
    await sb.from('consult_messages').insert({ run_id: run.id, role: 'tool', content: s.tool, tool: { args: s.args, result } })
    scratch += `\n\n[도구 ${s.tool} 결과] ${JSON.stringify(result).slice(0, 1500)}`
  }
  const fallback = '도구를 여러 번 써도 답을 정리하지 못했습니다. 질문을 더 구체적으로 적어 주세요.'
  await sb.from('consult_messages').insert({ run_id: run.id, role: 'assistant', content: fallback })
  return fallback
}
