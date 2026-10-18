#!/usr/bin/env node
// v71ay C1·C3 셀프테스트 — Shopify 카테고리 파서·수집 가드(robots·차단 중단·0개=못 읽음) · 대장 SQL(중복·롤백이 삭제하지 않음).
import { collect, parseShopifyCategory } from './new-release-feeds.mjs'
import { buildRows, renderRollback, renderSql } from './new-release-ledger.mjs'

let pass = 0, fail = 0
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log(`❌ ${name}\n   기대 ${JSON.stringify(b)}\n   실제 ${JSON.stringify(a)}`)) }

const html = '<div data-app-card-handle-value="klaviyo" data-app-card-name-value="Klaviyo: Email &amp; SMS"></div><div data-app-card-handle-value="klaviyo" data-app-card-name-value="dup"></div><div data-app-card-handle-value="x" data-app-card-name-value="X"></div>'
eq('parseShopifyCategory 중복 handle 한 번·엔티티 해제', parseShopifyCategory(html), [{ handle: 'klaviyo', name: 'Klaviyo: Email & SMS' }, { handle: 'x', name: 'X' }])
eq('parseShopifyCategory 카드 0개', parseShopifyCategory('<html></html>'), [])

const res = (status, body = '') => ({ status, text: async () => body })
const sleep = async () => {}
const ok = (u) => (String(u).endsWith('robots.txt') ? res(200, 'User-agent: *\nDisallow: /internal/') : null)
let r = await collect({ fetchFn: async (u) => ok(u) ?? res(200, html), sleep })
eq('collect 정상: 카테고리 6곳 중복 합침', [r.shopify.length, r.stopped], [2, null])
r = await collect({ fetchFn: async (u) => ok(u) ?? res(429), sleep })
eq('collect 429 한 번이면 즉시 중단', [r.stopped?.startsWith('HTTP 429'), r.shopify.length], [true, 0])
r = await collect({ fetchFn: async (u) => ok(u) ?? res(200, '<html></html>'), sleep })
eq('collect 카드 0개는 0건 정상이 아니라 건너뜀', [r.shopify.length, r.skipped.length], [0, 6])
r = await collect({ fetchFn: async (u) => (String(u).endsWith('robots.txt') ? res(200, 'User-agent: *\nDisallow: /') : res(200, html)), sleep })
eq('collect robots 금지면 요청 0', [r.shopify.length, r.skipped[0]], [0, 'shopify: robots disallowed'])
r = await collect({ fetchFn: async (u) => (String(u).endsWith('robots.txt') ? res(500) : res(200, html)), sleep })
eq('collect robots 못 읽으면 허용으로 접지 않는다', r.skipped[0], 'shopify: robots unverified')

const areas = { 2: { ko: [], en: ['invoice', 'helpdesk'] }, 3: { ko: [], en: ['email marketing'] } }
const picked = [{ name: "O'Reilly Notes", area: '5', appstore_country: 'us', appstore_id: '9', rating_count: 800, developer: 'D', genre: 'Productivity' }]
const rows = buildRows({ picked, shopify: [{ handle: 'a', name: 'Sufio Invoice', category: 'finances' }, { handle: 'b', name: 'Sufio invoice', category: 'sales' }, { handle: 'c', name: 'Plain', category: 'sales' }, { handle: 'd', name: 'Gorgias helpdesk', category: 'sales' }], regShopify: new Set(['app:d']), areas })
eq('buildRows: 차트 먼저·Shopify 중복 이름 제거·영역 힌트 없는 것 제외·이미 타깃 있는 handle 제외', rows.map((x) => [x.name, x.source]), [["O'Reilly Notes", 'chart'], ['Sufio Invoice', 'shopify']])
eq('buildRows: 이미 대장에 있는 이름 제외', buildRows({ picked, knownNames: new Set(['oreillynotes']), areas }).length, 0)
eq('buildRows: 하루 상한', buildRows({ picked: Array.from({ length: 60 }, (_, i) => ({ name: `n${i}`, area: '1', appstore_country: 'us', appstore_id: String(i), rating_count: 1, developer: null, genre: 'g' })), areas }).length, 45)
const sql = renderSql(rows, '2026-10-19')
eq('SQL: 작은따옴표 이스케이프·origin·중복 방지', [sql.includes("'O''Reilly Notes'"), sql.includes("'new_release'"), sql.includes('NOT EXISTS')], [true, true, true])
const rb = renderRollback(rows, '2026-10-19')
eq('롤백은 삭제하지 않고 기각으로 접는다(사람 검토 전 행만)', [/\bDELETE\b|\bDROP\b/i.test(rb), rb.includes("verdict = 'rejected'"), rb.includes("human_review = 'pending'")], [false, true, true])
eq('빈 입력은 SQL 없음', renderSql([], 'd').startsWith('--'), true)

console.log(`new-release selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
