#!/usr/bin/env node
// 어드바이저 전수 매칭 감사 — 실제 프로덕션 데이터로 노이즈 매칭을 찾아낸다.
//
// 셀프테스트(scripts/advisor-selftest.mjs)는 픽스처로 로직을 고정한다. 이 스크립트는
// 반대쪽이다 — 실제 DB 덤프를 넣고 "지금 사용자에게 뭐가 보이고 있나"를 전수로 찍는다.
// 어떤 낱말로 겹쳤는지까지 출력하므로, 불용어 후보를 눈으로 고를 수 있다.
//
// 덤프 만드는 법 (Supabase MCP / SQL 콘솔에서 실행 후 결과를 파일로 저장):
//   SELECT json_build_object(
//     'angles', (SELECT json_agg(json_build_object(
//        'angle_id', a.id, 'project_id', a.project_id, 'headline_draft', a.headline_draft,
//        'aspect_name', asp.name, 'aspect_notes', asp.notes,
//        'pitch', p.product_elevator_pitch, 'seller_own_guess', p.seller_own_guess))
//      FROM analysis_angles a
//      LEFT JOIN analysis_aspects asp ON asp.id = a.aspect_id
//      LEFT JOIN analysis_projects p ON p.id = a.project_id),
//     'failed_angles', (SELECT json_agg(t) FROM failed_angles t),
//     'principles',    (SELECT json_agg(t) FROM strategy_principles t),
//     'studies',       (SELECT json_agg(t) FROM case_studies t),
//     'moves',         (SELECT json_agg(t) FROM case_moves t))::text;
//
// 실행: node scripts/advisor-corpus-audit.mjs <덤프.json>

import fs from 'node:fs'
import { toTerms, matchFailedAngles, matchPrinciples, matchCaseMoves } from '../lib/cases/advisor.ts'

const path = process.argv[2]
if (!path) { console.error('사용법: node scripts/advisor-corpus-audit.mjs <덤프.json>'); process.exit(2) }
const db = JSON.parse(fs.readFileSync(path, 'utf8'))

const trim = (s, n) => (s == null ? '' : String(s).length > n ? String(s).slice(0, n) + '…' : String(s))

// route.ts 가 앵글 컨텍스트를 조립하는 방식 그대로다.
function contextOf(a) {
  const desc = [a.aspect_name, a.aspect_notes, a.headline_draft].filter(Boolean).join(' · ') || a.seller_own_guess || null
  return { category: a.pitch ?? null, angleDescription: desc }
}

let pairs = 0
console.log(`앵글 ${db.angles.length} · 실패사례 ${db.failed_angles.length} · 원칙 ${db.principles.length} · 케이스 ${db.studies.length}/${db.moves.length}\n`)

for (const a of db.angles) {
  const ctx = contextOf(a)
  const terms = toTerms(ctx.category, ctx.angleDescription)
  const b = matchFailedAngles(terms, db.failed_angles)
  const c = matchPrinciples(terms, db.principles)
  const A = matchCaseMoves(terms, db.studies, db.moves)
  if (b.cards.length === 0 && c.cards.length === 0 && A.cards.length === 0) continue

  console.log(`■ ${a.angle_id.slice(0, 8)} · "${trim(ctx.category, 40)}"`)
  console.log(`  앵글: ${trim(ctx.angleDescription, 80)}`)
  for (const card of b.cards) {
    console.log(`  [B 실패] ${card.case_key} (${trim(card.product_category, 24)}) score ${card.score} ← ${JSON.stringify(card.matched_terms)}`)
    pairs++
  }
  for (const card of c.cards) {
    console.log(`  [C 원칙] ${card.sp_id} score ${card.score.toFixed(1)} ← ${JSON.stringify(card.matched_terms)}`)
    pairs++
  }
  for (const card of A.cards) {
    console.log(`  [A 선례] ${card.slug} / ${card.lever} score ${card.score} ← ${JSON.stringify(card.matched_terms)}`)
    pairs++
  }
  console.log('')
}

console.log(`총 매칭 쌍 ${pairs}건`)
