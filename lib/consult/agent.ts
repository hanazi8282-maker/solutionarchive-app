// R7 에이전트 — 진단·메모를 근거로 질문에 답한다. 도구 호출은 JSON 프로토콜(프로바이더 무관), 최대 MAX_STEPS 단계, 한 턴 예산 ≈ $0.05(Sonnet).
// 도구: search_cases(보유 사례 조회) · recalc_loss(내 숫자로 손실 재계산 — 곱셈은 코드) · show_memo(저장된 결정 메모 조회).
import { readFileSync } from 'node:fs'
import { consultLlmJson } from './llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { db, type Run } from './runs.ts'
import { MAX_STEPS, parseStep, recalcLoss, validateToolArgs, type ToolName } from './agent-validate.ts'
import { CATEGORIES, MECHANISMS, caseLine, type CaseRow } from './cases-validate.ts'
import { getViabilityRules } from './viability.ts'
import type { ViabilityRules } from './viability-types.ts'

// H2(2026-11-14): "결정 메모" 호칭이 어색하다는 지적 — 회사형은 "실행 리포트", 아이디어형은 "사업기획서 초안".
const memoLabelFor = (kind: Run['kind']) => (kind === 'idea' ? '사업기획서 초안' : '실행 리포트')

const buildSystem = (kind: Run['kind']) => {
  const memoLabel = memoLabelFor(kind)
  return `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 저장된 진단과 ${memoLabel}를 근거로 대표님의 질문에 답합니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 권고는 "~하세요", 별명·농담 금지, "90일 재측정" 금지. 근거 없는 사실·숫자를 지어내지 않고 모르면 모른다고 합니다. 답은 400자 이내.
확률·변화율을 지어내지 않습니다("예측 확률", "~% 더 늘어날 여지" 같은 서술 금지) — 대표님이 입력한 숫자(전환율·객단가 등)를 그대로 인용하는 것은 됩니다.
사용할 수 있는 도구(필요할 때만, 한 번에 하나):
- search_cases: {"category":"${CATEGORIES.join('|')}","mechanism":"${MECHANISMS.join('|')}"} 중 하나 이상 — 보유 사례(비슷한 회사) 조회. category 는 가능하면 항상 채우세요(위 "진단(0층)" 의 position.category 를 보고 이 목록 중 가장 가까운 것을 고르세요) — category 를 비우면 mechanism 만으로 업종과 무관하게 같은 사례가 나옵니다(2026-11-13 실측 — "구독" 단어만으로 물었더니 업종이 전혀 다른 두 회사에 완전히 같은 사례 3건이 나왔습니다). 보유 사례에는 가격·전환율 지표가 없으므로 참고용으로만 쓰고 단정의 근거로 삼지 마세요.
- recalc_loss: {"audience":숫자,"rate_pct":숫자,"value_man":숫자,"leak_low":0~1,"leak_high":0~1} — 손실 재계산(곱셈은 시스템이 합니다)
- show_memo: {} — 저장된 ${memoLabel} 보기
- get_viability_rules: {"segment":"P|S|M|E"} — 사전 검증 게이트·kill criteria·실패모드 조회(v71cl-엔진, 왜 이 단계에서 끊겼다고 보는지 설명할 때 씀)
출력은 JSON 객체 하나만: 도구가 필요하면 {"tool":"이름","args":{...}}, 답할 수 있으면 {"final":"답변"}.`
}

let viabilityRulesCache: ViabilityRules | null = null
function loadViabilityRules(): ViabilityRules {
  if (!viabilityRulesCache) viabilityRulesCache = JSON.parse(readFileSync(new URL('../../config/viability_rules_v1.json', import.meta.url), 'utf8'))
  return viabilityRulesCache as ViabilityRules
}

async function runTool(tool: ToolName, args: Record<string, unknown>, run: Run): Promise<unknown> {
  const sb = await db()
  if (tool === 'search_cases') {
    const { data } = await sb.rpc('case_retrieve', { p_category: args.category, p_mechanism: args.mechanism, p_outcome: null, p_decision_keyword: null, p_limit: 6 })
    // case_bank 에는 가격·전환율 전용 컬럼이 없다(2026-11-13 실측, 1643건 전수 0건) — 모델 재량에 맡기지 않고 코드에서 매번 참고용 표시를 강제한다.
    return ((data ?? []) as CaseRow[]).map(caseLine).filter(Boolean).slice(0, 3).map((c) => ({ ...c, note: '참고용 — 가격·전환율 지표 없음, 근거로 쓰지 말 것' }))
  }
  if (tool === 'recalc_loss') return recalcLoss(args as Parameters<typeof recalcLoss>[0])
  if (tool === 'get_viability_rules') return getViabilityRules(loadViabilityRules(), args.segment as 'P' | 'S' | 'M' | 'E')
  const { data } = await sb.from('consult_memos').select('body').eq('run_id', run.id).eq('version', 1).maybeSingle()
  return data?.body ?? { error: `저장된 ${memoLabelFor(run.kind)}가 없습니다.` }
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
    const r = await consultLlmJson({ runId: run.id, owner: run.owner_email, purpose: 'chat', tag: 'sonnet', system: buildSystem(run.kind), user: `${context}\n\n지금까지 대화:\n${history}\n\n대표님 질문: ${msg}${scratch}`, maxTokens: 1200 })
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
