#!/usr/bin/env node
// v71ba P0-1 셀프테스트 — mention-ledger-migrate.mjs · new-release-backfill.mjs. 네트워크·DB 없음.
// 보는 것: 대장 SQL → 마이그 감싸기(옛 WHERE 를 새 출시 가드로 교체·새 출시 행 섞이면 중단·롤백에 DELETE 없음),
//          새 출시 18행 소급(대상 = mention ∧ 집계 NULL·앵커 판정 3상태·언급 집계·id 로 한 행씩·행 수 불일치면 예외·롤백 원값), 정적 DB 접근 0.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { LEDGER_UPDATE_GUARD, renderLedgerSql } from '../lib/discovery/mention-loop.ts'
import { main as migrate, parseLedgerSql, renderRollback as ledgerRollback } from './mention-ledger-migrate.mjs'
import { baseName, classify, countMentions, isTarget, main as backfill, plan, renderMigration, renderRollback } from './new-release-backfill.mjs'

let pass = 0
const t = async (name, fn) => {
  try {
    await fn()
    pass++
  } catch (e) {
    console.error(`❌ ${name}`)
    throw e
  }
}

const OLD = `-- 언급 루프 대장 2026-10-21 — x
INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, mention_count, post_count, source_count, alt_seek_posts, evidence_input_ids, area_code, area_fit, gate_blocked, last_seen_at)
VALUES
  ('saas', 'ADP', 'w', NULL, NULL, NULL, 'unverified', 'lookup_failed: 앱 ID 없음', 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']::uuid[], '4', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'O''Neil', 'w', NULL, NULL, NULL, 'unverified', 'r', 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000002']::uuid[], '2', 1, NULL, '2026-10-21T00:00:00+09:00')
ON CONFLICT (kind, lower(name)) DO UPDATE SET mention_count = EXCLUDED.mention_count
  WHERE public.discovery_candidates.origin = 'mention' AND public.discovery_candidates.verdict <> 'accepted';
`

await t('대장 파싱: 이름·날짜, 옛 WHERE → 새 출시 가드(mention_count IS NOT NULL)', () => {
  const p = parseLedgerSql(OLD)
  assert.deepEqual(p.names, ['ADP', "O'Neil"])
  assert.equal(p.date, '2026-10-21')
  assert.ok(p.body.includes(`WHERE ${LEDGER_UPDATE_GUARD};`))
  assert.ok(!p.body.includes("verdict <> 'accepted';"))
  assert.match(LEDGER_UPDATE_GUARD, /mention_count IS NOT NULL/)
})
await t('대장 파싱: 새 출시 행·ON CONFLICT 없음·날짜 여럿이면 중단, 빈 대장은 0행', () => {
  assert.throws(() => parseLedgerSql(OLD.replace(", 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']", ", 'new_release', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']")), /새 출시/)
  assert.throws(() => parseLedgerSql(OLD.replace(/ON CONFLICT[^\n]*\n/, '')), /ON CONFLICT/)
  assert.throws(() => parseLedgerSql(OLD.replace("'2026-10-21T00:00:00+09:00'),", "'2026-10-20T00:00:00+09:00'),")), /하나가 아니다/)
  assert.throws(() => parseLedgerSql('SELECT 1'), /형태가 아니다/)
  assert.deepEqual(parseLedgerSql('-- 대장 행 없음\n').names, [])
})
await t('현재 renderLedgerSql 출력도 가드를 쓴다(두 벌 아님)', () => {
  const j = { key: 'inkwell', name: 'Inkwell', stage: 'candidate', reason: null, posts: ['00000000-0000-0000-0000-000000000003'], sources: ['appstore'], roles: { from: 0, to: 1, alt: 0, compare: 0 }, mentions: 1, alt_seek_posts: 0, area: '1', area_fit: 1 }
  const sql = renderLedgerSql([j], new Map(), new Set(), '2026-10-22')
  assert.ok(sql.includes(`WHERE ${LEDGER_UPDATE_GUARD};`))
  assert.equal(parseLedgerSql(sql).body, sql.trim())
})
await t('대장 마이그: 드라이런은 파일 0, --write 는 본문+롤백, 롤백에 DELETE 없음', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mlm-'))
  const f = path.join(tmp, 'mention-ledger.sql')
  fs.writeFileSync(f, OLD)
  const quiet = { log: () => {} }
  assert.deepEqual(migrate([`--sql=${f}`, `--out-dir=${tmp}`, '--date=2026-10-22'], quiet).files, [])
  const r = migrate([`--sql=${f}`, `--out-dir=${tmp}`, '--date=2026-10-22', '--write'], quiet)
  assert.deepEqual(r.files.map((x) => path.basename(x)), ['20261022000030_mention_ledger_20261021.sql', '20261022000030_mention_ledger_20261021_rollback.sql'])
  const body = fs.readFileSync(r.files[0], 'utf8')
  assert.match(body, /^BEGIN;$/m)
  assert.match(body, /^COMMIT;$/m)
  assert.ok(body.includes(LEDGER_UPDATE_GUARD))
  const rb = fs.readFileSync(r.files[1], 'utf8')
  assert.doesNotMatch(rb, /DELETE|DROP/i)
  assert.match(rb, /lower\(name\) IN \('adp', 'o''neil'\)/)
  assert.ok(ledgerRollback({ names: ['A'], date: '2026-10-21' }, 'x.sql').includes('AND mention_count IS NOT NULL'))
})

// ── 새 출시 18행 소급 ──
const id = (n) => `00000000-0000-0000-0000-00000000010${n}`
const rows = [
  { id: id(1), name: 'Voice Recorder - Audio Record', origin: 'mention', mention_count: null, probe_source_key: 'appstore', probe_ref: 'gb:936694037', verdict_reason: '새 출시 입력(chart) — x' },
  { id: id(2), name: 'Klaviyo: Email Marketing & SMS', origin: 'mention', mention_count: null, probe_source_key: 'shopify_apps', probe_ref: 'app:klaviyo-email-marketing', verdict_reason: null },
  { id: id(3), name: 'Gorgias: AI Helpdesk & Chat', origin: 'mention', mention_count: null, probe_source_key: 'shopify_apps', probe_ref: 'app:helpdesk', verdict_reason: 'r' },
  { id: id(4), name: 'EasyScan Inventory & Barcode', origin: 'mention', mention_count: null, probe_source_key: 'shopify_apps', probe_ref: 'app:easyscan-inventory-and-order', verdict_reason: 'r' },
]
const realMention = { id: id(5), name: 'ADP', origin: 'mention', mention_count: 3, verdict_reason: 'area_fit(4 1)' }
const hn = { id: id(6), name: 'Tasklane', origin: null, mention_count: null, verdict_reason: 'HN' }

await t('대상: origin=mention ∧ 집계 NULL 만(언급 행·HN 행 제외)', () => {
  assert.deepEqual([...rows, realMention, hn].filter(isTarget).map((r) => r.id), rows.map((r) => r.id))
})
await t('baseName', () => {
  assert.deepEqual(['Klaviyo: Email Marketing & SMS', 'Voice Recorder - Audio Record', 'Bundles.app ‑ Inventory Sync', 'MabangErp3'].map(baseName), ['Klaviyo', 'Voice Recorder', 'Bundles.app', 'MabangErp3'])
})
await t('앵커 3상태: lookup 없으면 unverified(접지 않음) · 이름 맞으면 anchored · 핸들 불일치 ambiguous · 경로 없음 unverified', () => {
  assert.equal(classify(rows[0]).state, 'unverified')
  const lk = new Map([['936694037', [{ trackId: 936694037, trackName: 'Voice Recorder - Audio Record', sellerName: 'LiveBird', userRatingCount: 17148 }]]])
  assert.equal(classify(rows[0], lk).state, 'anchored')
  const other = new Map([['936694037', [{ trackId: 936694037, trackName: 'Totally Different', sellerName: 'X', userRatingCount: 9 }]]])
  assert.equal(classify(rows[0], other).state, 'ambiguous')
  assert.deepEqual(rows.slice(1).map((r) => classify(r).state), ['anchored', 'ambiguous', 'anchored'])
  assert.equal(classify({ name: 'X', probe_source_key: null, probe_ref: null }).state, 'unverified')
})
await t('언급 집계: 같은 추출기, 브랜드 토막으로도 셈', () => {
  const posts = [
    { id: 'b', source_key: 'appstore', area_code: '3', raw_text: 'I switched from Klaviyo to this app, much cheaper.' },
    { id: 'a', source_key: 'hackernews', area_code: '3', raw_text: 'Looking for an alternative to Klaviyo. moved from Klaviyo to Omnisend' },
    { id: 'c', source_key: 'appstore', area_code: '1', raw_text: 'great app' },
  ]
  const c = countMentions('Klaviyo: Email Marketing & SMS', posts)
  assert.deepEqual([c.post_count, c.source_count, c.evidence_input_ids, c.area_fit], [2, 2, ['a', 'b'], 1])
  assert.ok(c.mention_count >= 2)
  assert.equal(c.alt_seek_posts, 1)
  assert.deepEqual(countMentions('Nothing Here', posts), { mention_count: 0, post_count: 0, source_count: 0, alt_seek_posts: 0, evidence_input_ids: [], area_fit: null })
})
await t('소급 마이그: id 로 한 행씩·가드·행 수 검사·0 도 측정값으로 채움·verdict 불변·롤백 원값·DELETE 없음', () => {
  const p = plan([...rows, realMention, hn], [{ id: 'x', source_key: 's', area_code: '3', raw_text: 'moved from Klaviyo to Omnisend' }])
  assert.equal(p.length, 4)
  const m = renderMigration(p, 'f.sql', { postsN: 1 })
  assert.match(m, /IF n <> 4 THEN RAISE EXCEPTION/)
  assert.ok(m.includes(`WHERE id = '${id(1)}' AND origin = 'mention' AND mention_count IS NULL AND human_review = 'pending';`))
  assert.ok(!m.includes(id(5)))
  assert.ok(m.includes("origin = 'new_release', verdict_reason = '새 출시 입력(chart) — x · v71ba 소급: unverified(앱 936694037 lookup 안 함) → 후보 기록만', mention_count = 0, post_count = 0"))
  assert.match(m, /mention_count = 1, post_count = 1, source_count = 1, alt_seek_posts = 0, evidence_input_ids = ARRAY\['x'\]::uuid\[\], area_fit = 1/)
  assert.equal(p[1].verdict_reason, 'v71ba 소급: anchored(Shopify 핸들 app:klaviyo-email-marketing ↔ 이름 일치) → 등록 후보')
  assert.doesNotMatch(m, /verdict = /)
  const rb = renderRollback(p, 'f.sql')
  assert.doesNotMatch(rb + m, /DELETE|DROP/i)
  assert.ok(rb.includes("SET origin = 'mention', verdict_reason = NULL, mention_count = NULL"))
  assert.ok(rb.includes(`WHERE id = '${id(1)}' AND origin = 'new_release'`))
})
await t('소급 CLI: 옛 입력(origin 칸 없음)은 중단, 드라이런 파일 0, --run 이면 마이그+롤백', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nrb-'))
  const inp = path.join(tmp, 'in.json')
  const quiet = { log: () => {} }
  fs.writeFileSync(inp, JSON.stringify({ posts: [], projects: [], targets: [], discovery: [{ name: 'Old', verdict: 'rejected' }] }))
  await assert.rejects(backfill([`--input=${inp}`], quiet), /origin·mention_count 칸이 없다/)
  fs.writeFileSync(inp, JSON.stringify({ posts: [], projects: [], targets: [], discovery: [...rows, realMention] }))
  await backfill([`--input=${inp}`, `--out-dir=${tmp}`], quiet)
  assert.equal(fs.readdirSync(tmp).filter((f) => f.endsWith('.sql')).length, 0)
  await backfill([`--input=${inp}`, `--out-dir=${tmp}`, '--run', '--date=2026-10-22'], quiet)
  assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.endsWith('.sql')).sort(), ['20261022000020_new_release_backfill_v71ba.sql', '20261022000020_new_release_backfill_v71ba_rollback.sql'])
})
await t('정적: 두 스크립트 모두 DB 접근 0', () => {
  for (const f of ['mention-ledger-migrate.mjs', 'new-release-backfill.mjs']) {
    const src = fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, /@supabase|lib\/supabase|openDb|SERVICE_ROLE|rest\/v1|\.from\(|\.(insert|update|upsert|delete|rpc)\(/i, f)
  }
})
console.log(`mention-ledger selftest: ${pass} pass · 0 fail`)
