#!/usr/bin/env node
// scripts/gate-reject-log.mjs 셀프테스트 — 파일은 임시 폴더, 네트워크·DB 없음.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendRejects, estimate, main, readRejects, rejectLine, summaryLine } from './gate-reject-log.mjs'
import { planRegistration } from './window-discovery.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass++
  else { fail++; console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`) }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gaterej-'))
const now = new Date('2026-10-19T00:00:00Z')
const L = (d, cand, npr) => rejectLine({ at: new Date(`2026-10-${d}T01:00:00Z`), source: 'appstore', candidate: cand, reason: 'gate_blocked', active: 0, totalActive: 97, headroom: 0, newPerRequest: npr })

t('쓸 줄 없으면 파일 안 만듦', appendRejects(path.join(root, '2026-10-18'), []), null)
appendRejects(path.join(root, '2026-10-17'), [L('17', 'appstore|us:1', 40), L('17', 'appstore|us:2', null)])
appendRejects(path.join(root, '2026-10-18'), [L('18', 'appstore|us:1', 40), L('18', 'appstore|us:3', 10)])
fs.appendFileSync(path.join(root, '2026-10-18', 'gate-rejects.jsonl'), '{깨진 줄\n')

const r = readRejects(root, { days: 7, now })
t('읽기: 4줄 + 깨진 1줄을 센다(조용히 버리지 않음)', [r.lines.length, r.bad], [4, 1])
t('기간 밖은 뺀다', readRejects(root, { days: 1, now }).lines.length, 2)

const e = estimate(r.lines, { reqPerVisit: 2, revisitDays: 4, newPerRequest: 20, appstoreCap: 200, appstoreUsed: 190 })
// 유니크 3(us:1·us:2·us:3), 타깃당 하루 요청 0.5 → 요청 1.5. 리뷰 = 0.5×(40 + 20(null→기본) + 10) = 35
t('유니크 후보 수·추가 요청·리뷰', [e.blocked, e.extra_requests, e.extra_reviews], [3, 1.5, 35])
t('cap 여유 10 ≥ 추가 요청 → 들어간다', [e.cap_room, e.fits_cap], [10, true])
t('사용량 미입력이면 여유는 null(0 으로 접지 않음)', estimate(r.lines, {}).cap_room, null)
t('다른 소스는 안 센다', estimate([{ ...L('17', 'x', 1), source: 'googleplay' }], {}).blocked, 0)
t('한 줄 형식', summaryLine(e, '2026-10-19'), '[게이트 2026-10-19] 막은 후보 3(유니크) / 풀면 추가 일일 요청 ≈1.5·리뷰 ≈35 [추정] / appstore cap 200 대비 여유 10')

const out = []
main([`--dir=${root}`, '--days=7', '--appstore-used=190'], { log: (s) => out.push(s), now })
t('CLI: 요약 줄 + 깨진 줄 경고', [out[0].startsWith('[게이트 2026-10-19] 막은 후보 3'), out[1].includes('깨진 줄 1')], [true, true])
const empty = []
main([`--dir=${path.join(root, 'none')}`], { log: (s) => empty.push(s), now })
t('로그 0줄이면 확인 불가(0건 정상으로 접지 않음)', empty[0].includes('확인 불가'), true)

// 게이트 로직 불변 + 막은 후보에 gate 상세가 붙는다
const cand = (n) => ({ source_key: 'appstore', product_ref: 'kr:1000000', anchor_ref: 'us:1000000', label: `1:us|a${n}`, draftable: true, new_per_request: 30 })
const base = {
  targets: [{ source_key: 'appstore', product_ref: 'us:1000000', project_id: 'p' }],
  sources: [{ key: 'appstore', enabled: true, override: 'owner_2026-10-05', robots_status: 'disallowed', min_interval_ms: 1000 }],
}
const blocked = planRegistration([cand(2)], { ...base, state: { total_active: 97, sources: { appstore: { active: 30 } } } })
t('게이트 여유 0 → 등재 0 + gate 상세', [blocked.rows.length, blocked.skipped[0]?.reason, blocked.skipped[0]?.gate?.active, blocked.skipped[0]?.gate?.headroom], [0, 'gate_blocked', 30, 0])
const open = planRegistration([cand(2)], { ...base, state: { total_active: 97, sources: { appstore: { active: 0 } } } })
t('여유 있으면 그대로 등재(로직 불변)', [open.rows.length, open.skipped.length], [1, 0])

fs.rmSync(root, { recursive: true, force: true })
console.log(`gate-reject-log selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
