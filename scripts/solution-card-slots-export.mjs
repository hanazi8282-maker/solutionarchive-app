#!/usr/bin/env node
// P3(v71eg-5): 실제 12곳 카드 슬롯 JSON 내보내기 — 모델·DB 없음. results.json 의 카드를 결론서 슬롯(②→제목 … 조심할 것→주의)으로 바꿔 회사별 한 묶음으로 저장한다.
//   node scripts/solution-card-slots-export.mjs --in <solution-pipeline 결과폴더> --out <card-slots.json>
// 형식(v1): { version, flag:'SOLUTION_CARD_SLOTS', flag_default:'OFF', generated_at, companies:[{ slug, name, status, note, cards:[{ rank, kind:'try'|'caution', case_id, case_slug, auto, verify:{fit,coherent,why}, slots:{title,why,evidence_case,steps[],adapted,closing,caution} }] }] }
// 참고: v71eg-4 §2 의 원문 형식은 받지 못했다 — 위 형식은 v71eg-3 §2-3 의 매핑을 그대로 옮긴 것이다. 내부 근거(internal.evidence)는 화면용이 아니라 이 파일에 넣지 않는다.
import fs from 'node:fs'
import path from 'node:path'
const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const inDir = opt('in'), out = opt('out')
if (!inDir || !out) { console.error('사용법: --in <결과폴더> --out <card-slots.json>'); process.exit(64) }
const { cardToSolutionBox } = await import('../lib/solution-card/slots.ts')
const res = JSON.parse(fs.readFileSync(path.join(inDir, 'results.json'), 'utf8')).results
const companies = res.map((r) => ({
  slug: r.id, name: r.name, status: r.status, note: r.note ?? '',
  cards: r.cards.filter((x) => x.card).map((x, i) => ({ rank: i + 1, kind: x.cand.direction, case_id: x.cand.case.id, case_slug: x.cand.case.slug, auto: x.auto, verify: x.verify, slots: cardToSolutionBox(x.card) })).filter((c) => c.slots),
}))
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ version: 'card-slots-v1', flag: 'SOLUTION_CARD_SLOTS', flag_default: 'OFF', generated_at: new Date().toISOString(), companies }, null, 1))
console.log(`슬롯 JSON ${out} — 회사 ${companies.length} · 카드 ${companies.reduce((s, c) => s + c.cards.length, 0)}`)
