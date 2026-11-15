// v71cm 모드 C2 "새 아이디어 추천" 생성기(Opus). 입력: 본인 조건 4개 + 관심 분야(선택). 후보 풀은 사례 은행 조회 결과(mode-c2-pool.ts, v71ck 라벨 적재 전 임시).
// 근거 규칙: 참조 사례는 풀에 있는 이름만 쓴다(검증기가 거절). 풀이 비면 "근거 부족"으로 쓰고 후보 이유를 일반 논리로만 적는다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import { validateModeC2, type ModeC2 } from './mode-c2-validate.ts'
import { buildC2Pool, type C2Pool } from './mode-c2-pool.ts'
import { assertNoStatViolations } from './stat-lint.ts'
export { validateModeC2 }
export type { ModeC2 }

const SYSTEM = `당신은 예비 창업자에게 "지금 시작할 만한 사업 후보"를 추천하는 컨설턴트입니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 별명·농담 금지, "90일 재측정" 금지. 각 칸은 1~2문장으로 짧게 씁니다(출력이 길어지면 잘립니다). 확률·성공 가능성 퍼센트를 쓰지 않습니다. 근거 없는 사실·숫자를 지어내지 않고, 모르면 모른다고 씁니다.
근거: 아래 "후보 풀"에 적힌 사례·기저율만 인용합니다. reference_cases / failure_case 에는 풀에 있는 이름만 그대로 적습니다(풀에 없으면 빈 배열/null — 지어내지 않습니다).
절차:
1. 본인 조건(기술·자본·시간·고객 접점)에 맞지 않는 분야와, 풀의 기저율 표에서 폐업 비율이 높은 분야를 excluded 에 이유와 함께 적습니다.
2. 후보 3개를 만듭니다. 각 후보는 "왜 지금·누가·얼마에·어떻게 팔고·첫 10명은 어디서"를 채웁니다. 한국 소상공인 시장이면 한국 현실(세무·4대보험·네이버/카카오 플랫폼 등)에 맞춥니다.
3. 후보마다 다리 2(상품-채널·가격)와 다리 4(시장 크기)가 처음부터 막혀 있지 않다는 확인 문장을 killed_bridges 에 적습니다. 막혀 있으면 그 후보는 버리고 다른 후보를 만듭니다.
4. 이미 무료 플랫폼이 핵심 기능을 주는 후보는 버립니다. 순위는 다음 순서로 정합니다: ① 법·제도 때문에 사장님이 반복해서 해야 하는 의무(신고·명세서·세금·보험)를 대신 풀어 주어, 안 하면 과태료·분쟁이 생겨 돈 낼 이유가 분명한 후보 ② 기존 서비스가 "앞 단계(계산·기록)"까지만 하고 "뒤 단계(신고·제출)"를 비워 둔 빈칸이라 애드온·파트너 채널이 열리는 후보 ③ 분야 기저율이 낮은 후보 ④ 본인 고객 접점이 직접 닿는 후보. 단순 알림·재방문 메시지처럼 플랫폼이 곧 따라 만들 수 있는 기능은 순위를 낮춥니다.
5. top_pick: 1순위 후보 번호(0~2), 이유, 접어야 할 조건. 후보마다 첫 2주 실험(what·who·n(숫자)·success_metric·if_fail).
6. execution_package: artifacts(1순위 후보용 복붙 가능한 랜딩 첫 3줄·인터뷰 질문 5개·선결제 문구 중 2~5개) + plan_b(name·trigger).
7. two_line: known(이미 알고 있을 것, 60자) · unknown(모르고 있었을 것 — 핵심, 120자).
출력은 JSON 객체 하나만:
{"two_line":{"known":"","unknown":""},"conditions_summary":"","excluded":[{"area":"","reason":""}],"candidates":[{"name":"","why_now":"","who":"","price":"","how_to_sell":"","first_ten":"","reference_cases":[],"failure_case":null,"experiment":{"what":"","who":"","n":10,"success_metric":"","if_fail":""},"killed_bridges":[""]}],"top_pick":{"index":0,"reason":"","give_up_condition":""},"execution_package":{"artifacts":["",""],"plan_b":{"name":"","trigger":""}}}`

export type ModeC2Input = {
  runId: string
  owner: string
  tech: string // 개발 가능 / 노코드 / 불가
  capital: string
  hours: string
  access: string // 고객 접점이 있는 분야
  interests?: string
}

/** 관심 분야·접점 문장에서 풀 조회 키워드를 뽑는다. 사례 은행 category 는 영어 SaaS 분류라 기본 키워드를 함께 쓴다. */
export function poolKeywords(i: Pick<ModeC2Input, 'access' | 'interests'>): string[] {
  const base = ['payroll', 'HR', 'restaurant', 'salon', 'scheduling', 'accounting', 'inventory']
  const extra = `${i.access} ${i.interests ?? ''}`.split(/[\s,/]+/).map((w) => w.trim()).filter((w) => /^[A-Za-z]{3,}$/.test(w))
  return [...new Set([...base, ...extra])].slice(0, 10)
}

export function poolNames(pool: C2Pool): string[] {
  const names: string[] = []
  for (const list of Object.values(pool.successByCategory)) for (const c of list) names.push(c.name)
  for (const list of Object.values(pool.failureByCategory)) for (const c of list) names.push(c.company)
  return names
}

function poolText(pool: C2Pool): string {
  const base = pool.baseRates.map((r) => `${r.subindustry}: 표본 ${r.n}곳, 폐업 비율 ${r.inactivePct}%`).join('\n') || '(기저율 조회 결과 없음)'
  const succ = Object.entries(pool.successByCategory).flatMap(([k, v]) => v.map((c) => `- [성공·${k}] ${c.name} (${c.category ?? '분류 없음'}${c.monthlyRevenue ? `, 월 매출 공개 약 ${c.monthlyRevenue}` : ''})`)).join('\n') || '(성공 사례 없음)'
  const fail = Object.entries(pool.failureByCategory).flatMap(([k, v]) => v.map((c) => `- [실패·${k}] ${c.company} (${c.category ?? '분류 없음'}): ${c.causePrimary ?? '원인 미기재'}${c.lesson ? ` / ${c.lesson}` : ''}`)).join('\n') || '(실패 사례 없음)'
  return `[분야 기저율(YC 하위분야, 표본 30곳 이상·폐업 비율 낮은 순)]\n${base}\n\n[성공 사례]\n${succ}\n\n[실패 사례]\n${fail}`
}

export async function buildModeC2(sb: SupabaseClient, i: ModeC2Input): Promise<{ modeC2: ModeC2; costUsd: number; model: string; poolSize: number }> {
  const pool = await buildC2Pool(sb, poolKeywords(i))
  const names = poolNames(pool)
  const user = `본인 조건\n- 기술: ${i.tech}\n- 자본: ${i.capital}\n- 투입 시간: ${i.hours}\n- 고객 접점이 있는 분야: ${i.access}${i.interests ? `\n- 관심 분야: ${i.interests}` : ''}\n\n후보 풀(사례 은행 조회 결과 — 이 안의 이름만 인용)\n<<<\n${poolText(pool)}\n>>>`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 9000 })
      cost += r.costUsd
      const modeC2 = validateModeC2(r.data, names)
      assertNoStatViolations(JSON.stringify(modeC2), '모드C2')
      return { modeC2, costUsd: cost, model: r.model, poolSize: names.length }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
