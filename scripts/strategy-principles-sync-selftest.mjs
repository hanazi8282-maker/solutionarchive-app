#!/usr/bin/env node
// parseStrategyTable 셀프테스트. 네트워크·DB 없음.
// 정본 md 를 실제로 파싱하고, 형식 위반이 조용히 넘어가지 않는지(§7.1) 확인한다.

import fs from 'node:fs'
import { parseStrategyTable } from './strategy-principles-sync.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)
const throws = (name, fn) => {
  try { fn(); fail++; console.log(`❌ ${name} — throw 했어야 하는데 안 함`) }
  catch { pass++ }
}

// ── 정본 md ──────────────────────────────────────────────────────
const rows = parseStrategyTable(fs.readFileSync('docs/strategy-principles.md', 'utf8'))
// ⚠️ 행을 추가하면 이 숫자도 같이 올려라. SP-024~026 을 넣을 때 안 올려서
//    이 검사가 26 vs 23 으로 **이미 빨간불이었다**(round-3 에서 발견해 정정).
//    빨간불을 방치하면 다음 사람이 "원래 실패하는 검사"로 배우고 넘긴다.
t('정본: 30행', rows.length, 30)
t('정본: 첫 행 SP-001', rows[0].sp_id, 'SP-001')
t('정본: 끝 행 SP-031', rows[rows.length - 1].sp_id, 'SP-031')
// 번호가 1부터 빈칸 없이 이어지는지 — 단 **SP-029 는 의도된 결번**이다.
// 미머지 브랜치(feat/review-sources-expand, PR #106)가 그 번호를 먼저 선점했고
// round-2(clien·fmkorea=SP-027·028)가 main 에 먼저 들어오면서 그 브랜치의
// 027·028 은 무효가 됐지만 029 는 아직 정의되지 않은 채 남았다. 그 브랜치가
// 머지되면(또는 폐기되면) 이 예외를 다시 검토한다 — 그때까지는 결번 1개를
// 알고 넘어가는 것이 "채워 넣은 척"보다 낫다(§7.1).
const KNOWN_RESERVED_GAPS = new Set(['SP-029']) // PR #106 미머지로 인한 의도된 결번
ok(
  '정본: SP-001..SP-031 이 (알려진 결번 제외) 중복 없이 이어진다',
  (() => {
    const expected = []
    for (let i = 1; i <= 31; i++) {
      const id = `SP-${String(i).padStart(3, '0')}`
      if (!KNOWN_RESERVED_GAPS.has(id)) expected.push(id)
    }
    return rows.map((r) => r.sp_id).join(',') === expected.join(',')
  })(),
)
ok('정본: 전부 SP-NNN 형식', rows.every((r) => /^SP-\d{3}$/.test(r.sp_id)))
ok('정본: 전부 등급 A~D', rows.every((r) => ['A', 'B', 'C', 'D'].includes(r.evidence_grade)))
ok('정본: 전부 태그 1개 이상', rows.every((r) => r.tags.length >= 1))
ok('정본: 전부 출처 있음', rows.every((r) => r.source_ref.length > 0))

// 등급 셀 'B (3자 서베이)' → 등급 B + 주석 분리
const sp001 = rows.find((r) => r.sp_id === 'SP-001')
t('SP-001 등급', sp001.evidence_grade, 'B')
t('SP-001 등급 주석', sp001.evidence_grade_note, '3자 서베이')
// 괄호 없는 셀 → 주석 null
const sp002 = rows.find((r) => r.sp_id === 'SP-002')
t('SP-002 등급 주석 없음', sp002.evidence_grade_note, null)
// 태그 여러 개
const sp015 = rows.find((r) => r.sp_id === 'SP-015')
t('SP-015 태그 3개', sp015.tags.length, 3)
ok('SP-015 태그에 korea', sp015.tags.includes('korea'))

// ── 형식 위반은 throw (조용히 건너뛰지 않는다) ─────────────────────
const H = '| ID | 태그 | 진술 | evidence_grade | 출처 |\n|---|---|---|---|---|\n'
throws('등급이 A~D 아님 → throw', () => parseStrategyTable(H + '| SP-001 | x | 진술 | Z (메모) | §1 |'))
throws('태그 비어있음 → throw', () => parseStrategyTable(H + '| SP-001 |  | 진술 | A | §1 |'))
throws('진술 비어있음 → throw', () => parseStrategyTable(H + '| SP-001 | x |  | A | §1 |'))
throws('출처 비어있음 → throw', () => parseStrategyTable(H + '| SP-001 | x | 진술 | A |  |'))
throws('중복 ID → throw', () => parseStrategyTable(H + '| SP-001 | x | a | A | §1 |\n| SP-001 | y | b | B | §2 |'))
throws('SP 행이 0건 → throw', () => parseStrategyTable(H))

// 정상 최소 표는 통과
{
  const r = parseStrategyTable(H + '| SP-042 | pricing, x | 어떤 진술 | C (자체) | §9 |')
  t('최소 표: 1행', r.length, 1)
  t('최소 표: 등급', r[0].evidence_grade, 'C')
  t('최소 표: 주석', r[0].evidence_grade_note, '자체')
  t('최소 표: 태그 2개', r[0].tags.length, 2)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('표 파서가 틀렸다. 시드/동기화가 원장과 어긋난다.'); process.exitCode = 1 }
else console.log(`표 파서 정상 — 정본 ${rows.length}행 + 형식 위반 전부 throw.`)
