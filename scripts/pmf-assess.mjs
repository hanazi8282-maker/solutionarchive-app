#!/usr/bin/env node
// PMF 2축 진단기 (CTO 엔진 b).
//
//   node --env-file=.env.local scripts/pmf-assess.mjs --input ops/pmf/<이름>.json [--dry]
//   node --env-file=.env.local scripts/pmf-assess.mjs --example        (입력 양식만 찍는다)
//
// 종료 코드: 0 matched / 1 no_match(음성) / 2 not_run(확인 불가)
//   ★ 1 과 2 를 반드시 나눈다. "선례가 없다"와 "못 찾아봤다"는 다른 사건이고
//     다음 행동이 정반대다 (case-match.mjs 와 같은 규약).
//
// ⚠️ 단일 점수를 만들지 않는다.
//    수요축과 선례축은 출처가 다르고(우리 리뷰 데이터 vs 남의 사례) 틀리는 방식도
//    다르다. 한 숫자로 곱하면 "선례가 없어서 낮음"과 "수요가 없어서 낮음"이 같은
//    값이 되는데, 전자는 "직접 검증하라"이고 후자는 "손대지 마라"다. 화면이 같아지면
//    정반대 행동이 같은 근거를 갖게 된다. `pmf_assessments` 에 pmf_score 컬럼이
//    없는 것도 같은 이유다.
//
// ⚠️ 산식을 여기서 다시 만들지 않는다.
//    demandAxis / precedentAxis / quadrantOf 는 lib/cases/match.ts 한 벌뿐이다.
//    두 벌이 되는 순간 화면과 스크립트의 값이 갈라지고, 어느 쪽이 맞는지 아무도 모른다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'
import { matchMoves, demandAxis, precedentAxis, quadrantOf } from '../lib/cases/match.ts'
import {
  BUSINESS_MODEL, BUYER_TYPE, PURCHASE_FREQUENCY, PRICE_BAND, BOTTLENECK,
} from '../lib/cases/draft.ts'

const VOCAB = {
  business_model: BUSINESS_MODEL,
  buyer_type: BUYER_TYPE,
  purchase_frequency: PURCHASE_FREQUENCY,
  price_band: PRICE_BAND,
  bottleneck: BOTTLENECK,
}

export const EXAMPLE_INPUT = {
  item: '두피 각질용 저자극 샴푸',
  market: '탈모·두피 케어',
  bottleneck: 'TRUST',
  price_band: 'MID',
  buyer_type: 'B2C',
  business_model: 'D2C',
  purchase_frequency: 'REPEAT',
  target_project_id: null,
  created_by: 'cto',
}

/**
 * 사람이 쓴 입력을 케이스 어휘로 정규화한다.
 *
 * ★ 어휘 밖 값을 **가장 가까운 값으로 밀어 넣지 않는다.** 비운다.
 *   밀어 넣으면 매칭 결과가 입력과 다른 전제 위에서 나오는데, 화면에서는
 *   구분이 안 된다. 비우면 그 축의 패싯 가점만 못 받을 뿐 결과가 왜곡되지 않는다.
 *   무엇을 왜 비웠는지는 notes 로 올려 보고에 찍는다.
 */
export function normalizeFacets(input) {
  const facets = {}
  const notes = []
  for (const [k, vocab] of Object.entries(VOCAB)) {
    const raw = input?.[k]
    if (raw === undefined || raw === null || raw === '') { facets[k] = null; continue }
    const up = String(raw).trim().toUpperCase()
    if (vocab.includes(up)) { facets[k] = up; continue }
    facets[k] = null
    notes.push(`${k}="${raw}" 는 어휘 밖이라 비웠다 (허용: ${vocab.join('/')})`)
  }
  return { facets, notes }
}

function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}

if (isMain()) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
  }
  const dry = argv.includes('--dry')

  if (argv.includes('--example')) {
    console.log(JSON.stringify(EXAMPLE_INPUT, null, 2))
    process.exit(0)
  }

  const inputPath = opt('input')
  if (!inputPath) {
    console.error('사용: --input <json경로> [--dry]   (양식: --example)')
    process.exit(2)
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`⚠️ 확인 불가: 입력 파일이 없다 — ${inputPath}`)
    process.exit(2)
  }

  let input
  try { input = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) }
  catch (e) { console.error(`⚠️ 확인 불가: 입력 JSON 파싱 실패 — ${e.message}`); process.exit(2) }

  const { facets, notes } = normalizeFacets(input)
  for (const n of notes) console.log(`⚠️ ${n}`)

  let supabase
  try { supabase = await createClient() }
  catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); process.exit(2) }
  if (!supabase) {
    console.error('⚠️ 확인 불가: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    process.exit(2)
  }

  // 조회 실패는 null. 빈 배열과 섞지 않는다 — 섞는 순간 matchMoves 가
  // "확인 불가"를 "선례 없음"으로 접는다.
  async function q(table, select, filter) {
    let query = supabase.from(table).select(select)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) {
      console.error(`⚠️ ${table} 조회 실패 — ${error.code ?? ''} ${error.message}`)
      if (['42P01', 'PGRST205'].includes(error.code)) {
        console.error('   관련 마이그레이션 미적용일 수 있다. 사람이 `supabase db query --linked -f` 로 적용한다 (§12-5).')
      }
      return null
    }
    return data
  }

  const studies = await q('case_studies',
    'id,slug,brand_name,bottleneck,business_model,buyer_type,price_band,outcome_status,review_status')
  const moves = await q('case_moves',
    'id,case_study_id,lever,claim,evidence_grade,outcome_direction,review_status,metric_name,metric_before,metric_after,metric_unit')

  const match = matchMoves(facets.bottleneck, studies, moves, null, facets)

  // ── 수요축 ────────────────────────────────────────────────
  const projectId = input.target_project_id ?? null
  let demand = { value: null, reason: '분석 프로젝트를 지정하지 않았다 — 수요축 확인 불가(0 이 아니다)' }
  if (projectId) {
    const aspects = await q('analysis_aspects', 'opportunity_score', (qq) => qq.eq('project_id', projectId))
    demand = demandAxis(aspects === null ? null : aspects.map((a) => a.opportunity_score))
  }

  const precedent = precedentAxis(match)
  const quad = quadrantOf(demand.value, precedent.value)

  // ── 보고 (넓은 표 금지, 항목당 한 줄) ─────────────────────
  console.log(`\n# PMF 진단 — ${input.item ?? '(아이템 미기재)'}${input.market ? ` · ${input.market}` : ''}`)
  console.log(`- 패싯: ${Object.entries(facets).map(([k, v]) => `${k}=${v ?? '—'}`).join(' · ')}`)
  console.log(`- 매칭: ${match.status} — ${match.reason}`)
  console.log(`- 수요축: ${demand.value === null ? '확인 불가' : demand.value.toFixed(3)} — ${demand.reason}`)
  console.log(`- 선례축: ${precedent.value === null ? '확인 불가' : precedent.value.toFixed(3)} — ${precedent.reason}`)
  console.log(`- 사분면: ${quad.quadrant ?? '내지 않음'} — ${quad.reason}`)
  console.log(`- 제외: 자기 ${match.excluded.self} · 미승인 ${match.excluded.not_approved} · 등급D ${match.excluded.grade_d}`)

  if (match.moves.length) {
    console.log('\n## 인용 선례')
    for (const m of match.moves.slice(0, 10)) {
      console.log(`- [${m.evidence_grade}] ${m.study.brand_name} · ${m.lever} (${m.outcome_direction}) — ${m.claim.slice(0, 80)}`)
    }
  }

  // ── 저장 ──────────────────────────────────────────────────
  //
  // not_run 이면 축·사분면을 전부 NULL 로 넣는다. DB CHECK 도 같은 걸 강제하지만
  // 여기서 먼저 지운다 — 제약에 걸려 저장이 통째로 실패하면 진단 기록 자체가 사라진다.
  const notRun = match.status === 'not_run'
  const row = {
    input,
    facets,
    target_project_id: projectId,
    demand_axis: notRun ? null : demand.value,
    precedent_axis: notRun ? null : precedent.value,
    quadrant: notRun ? null : quad.quadrant,
    match_status: match.status,
    match_reason: match.reason,
    created_by: input.created_by ?? 'pmf-assess.mjs',
  }

  if (dry) {
    console.log('\n(dry) DB 에 쓰지 않았다.')
    process.exit(match.status === 'matched' ? 0 : match.status === 'no_match' ? 1 : 2)
  }

  const ins = await supabase.from('pmf_assessments').insert(row).select('id').single()
  if (ins.error) {
    console.error(`\n⚠️ 확인 불가: pmf_assessments 저장 실패 — ${ins.error.code ?? ''} ${ins.error.message}`)
    if (['42P01', 'PGRST205'].includes(ins.error.code)) {
      console.error('   마이그레이션 20260908000003_pmf_assessments.sql 미적용이다. 사람이 적용한다 (§12-5).')
    }
    process.exit(2)
  }
  console.log(`\n✅ pmf_assessments ${ins.data.id} 저장 (match_status=${match.status})`)

  if (match.moves.length) {
    const moveRows = match.moves.slice(0, 20).map((m) => ({
      assessment_id: ins.data.id,
      case_move_id: m.id,
      match_score: m.match_score,
      match_reason: m.facet_hits.length ? `패싯일치 ${m.facet_hits.join('/')}` : '병목 일치',
      matched_by: 'facet',
    }))
    const mr = await supabase.from('pmf_assessment_moves').insert(moveRows)
    if (mr.error) {
      // 진단 본체는 저장됐다. 근거 연결만 실패했다 — 그 사실을 감추지 않는다.
      console.error(`⚠️ 인용 무브 연결 실패 — ${mr.error.code ?? ''} ${mr.error.message}`)
      console.error('   진단 행은 남았지만 근거 추적이 끊긴 상태다. 무브가 강등돼도 감지되지 않는다.')
      process.exit(2)
    }
    console.log(`✅ pmf_assessment_moves ${moveRows.length}행 연결`)
  }

  process.exit(match.status === 'matched' ? 0 : match.status === 'no_match' ? 1 : 2)
}
