// v71dx — v2.6b 후보 셀프테스트(모델 호출 0). node scripts/v26b-selftest.mjs
import { RELEVANCE_V26_BLOCK } from '../lib/analysis/relevance-criteria-v26.ts'
import { systemV26bFromV26, RELEVANCE_V26B_ADD, RELEVANCE_V26B_VERSION } from '../lib/analysis/relevance-criteria-v26b.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗ ' + m) } }
const sys = 'head ' + RELEVANCE_V26_BLOCK + ' tail v26-2026-11-23'
const out = systemV26bFromV26(sys)
ok(out.includes('(24) 앱스토어') && out.split('(24) 앱스토어').length === 2, '(24) 가 정확히 한 번 붙는다')
ok(out.includes(RELEVANCE_V26_BLOCK) && out.startsWith('head '), 'v2.6 블록 본문은 그대로')
ok(out.includes(RELEVANCE_V26B_VERSION) && !out.includes('v26-2026-11-23'), '버전 표기가 v26b 로 바뀐다')
let threw = false; try { systemV26bFromV26('v2.4 프롬프트') } catch { threw = true }
ok(threw, 'v2.6 블록이 없으면 조용히 통과하지 않고 던진다(§7.1)')
ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(RELEVANCE_V26B_ADD), '예시에 실제 id 가 없다')
console.log(`v26b selftest: ${pass} pass · ${fail} fail`); process.exit(fail ? 1 : 0)
