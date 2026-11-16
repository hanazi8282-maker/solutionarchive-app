// 컨설팅 모드 B(결정 검증)·C1(아이디어 검증)·C2(새 아이디어 추천) 실행기 — 웹 라우트와 승인 테스트 스크립트가 같은 코드를 쓴다.
// run 은 consult_runs 를 그대로 쓴다(owner_email 경계·비용 기록 재사용): B=company, C1·C2=idea. 결과는 consult_mode_results.
import { buildModeB } from './report/mode-b.ts'
import { buildModeC1 } from './report/mode-c1.ts'
import { buildModeC2, poolKeywords, poolNames } from './report/mode-c2.ts'
import { buildC2Pool, type C2Pool } from './report/mode-c2-pool.ts'
import { createRun, db, setStatus, type Run } from './runs.ts'
import { recordPredictions } from './predictions.ts'
import { areasFrom, dbFetchLabels, discoverRefGroups, discoveryLines, type Discovery } from './discover.ts'
import fs from 'node:fs'
import path from 'node:path'

/** 참조군 자동 발견(P2-F) — C1·C2 입력 글로 사례 은행만 조회한다. 설정을 못 읽으면 not_run(확인 불가). 던지지 않는다. */
async function discover(sb: Awaited<ReturnType<typeof db>>, text: string): Promise<Discovery> {
  try {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', f), 'utf8'))
    return await discoverRefGroups(text, areasFrom(read('areas_v2.json'), read('community_keywords_v2.json')), dbFetchLabels(sb))
  } catch (e) {
    console.error(`refgroup discovery failed: ${e instanceof Error ? e.message : e}`)
    return { status: 'not_run', structure: {}, candidates: [] }
  }
}

export type ModeKey = 'b' | 'c1' | 'c2'

export type ModeInput =
  | { mode: 'b'; company: string; decision: string; context: string }
  | { mode: 'c1'; idea: string; conditions: string; extra?: string }
  | { mode: 'c2'; tech: string; capital: string; hours: string; access: string; interests?: string }

/** 기능 플래그 — CONSULT_MODES=off 로 새 모드 화면·API 를 한 번에 끈다(문제가 생기면 이 변수만 바꾼다). */
export const modesEnabled = () => (process.env.CONSULT_MODES ?? '').toLowerCase() !== 'off'

function evidenceFrom(pool: C2Pool): { text: string; count: number } {
  const succ = Object.entries(pool.successByCategory).flatMap(([k, v]) => v.map((c) => `- [성공·${k}] ${c.name} (${c.category ?? '분류 없음'})`))
  const fail = Object.entries(pool.failureByCategory).flatMap(([k, v]) => v.map((c) => `- [실패·${k}] ${c.company} (${c.category ?? '분류 없음'}): ${c.causePrimary ?? '원인 미기재'}`))
  const base = pool.baseRates.slice(0, 12).map((r) => `- 기저율 ${r.subindustry}: 표본 ${r.n}곳, 폐업 비율 ${r.inactivePct}%`)
  const lines = [...succ, ...fail]
  return { text: [...base, ...lines].join('\n') || '(조회 결과 없음)', count: poolNames(pool).length }
}

/** 입력 → run 생성 → 생성 → 저장. 반환: run id. 생성 실패는 던지고 run 을 failed 로 남긴다. */
export async function runMode(owner: string, input: ModeInput): Promise<string> {
  const sb = await db()
  const run: Run = await createRun(owner, {
    kind: input.mode === 'b' ? 'company' : 'idea',
    name: input.mode === 'b' ? input.company.slice(0, 80) : null,
    url: null,
    oneLiner: input.mode === 'b' ? input.decision : input.mode === 'c1' ? input.idea : `조건: ${input.tech} / ${input.capital} / ${input.hours} / ${input.access}`,
    scenario: `mode_${input.mode}`,
  })
  try {
    await setStatus(run.id, 'diagnosing')
    let output: unknown
    let model: string
    let costUsd: number
    if (input.mode === 'b') {
      const pool = await buildC2Pool(sb, poolKeywords({ access: `${input.company} ${input.decision}`, interests: input.context }))
      const ev = evidenceFrom(pool)
      const r = await buildModeB({ runId: run.id, owner, company: input.company, decision: input.decision, context: input.context, evidence: ev.text, evidenceCount: ev.count })
      output = r.modeB; model = r.model; costUsd = r.costUsd
    } else if (input.mode === 'c1') {
      const pool = await buildC2Pool(sb, poolKeywords({ access: input.idea, interests: input.conditions }))
      const ev = evidenceFrom(pool)
      const refgroup = await discover(sb, `${input.idea} ${input.conditions} ${input.extra ?? ''}`)
      const r = await buildModeC1({ runId: run.id, owner, oneLiner: input.idea, founderConditions: input.conditions, extra: input.extra, evidence: [...discoveryLines(refgroup), ev.text].join('\n'), evidenceCount: ev.count })
      output = { ...r.modeC1, refgroup }; model = r.model; costUsd = r.costUsd
    } else {
      const r = await buildModeC2(sb, { runId: run.id, owner, tech: input.tech, capital: input.capital, hours: input.hours, access: input.access, interests: input.interests })
      output = { ...r.modeC2, refgroup: await discover(sb, `${input.access} ${input.interests ?? ''} ${input.tech}`) }; model = r.model; costUsd = r.costUsd
    }
    const { error } = await sb.from('consult_mode_results').upsert({ run_id: run.id, mode: input.mode, input, output, model, cost_usd: costUsd }, { onConflict: 'run_id,mode' })
    if (error) throw new Error(`모드 결과 저장 실패: ${error.message}`)
    await recordPredictions(sb, run.id, input.mode, output) // G8 — 실패해도 던지지 않는다(로그만)
    await setStatus(run.id, 'done')
    return run.id
  } catch (e) {
    await setStatus(run.id, 'failed', e instanceof Error ? e.message.slice(0, 300) : 'mode failed')
    throw e
  }
}
