#!/usr/bin/env node
// v71ba P0-1 셀프테스트 — mention-ledger-migrate.mjs · new-release-backfill.mjs. 네트워크·DB 없음.
// 보는 것: 대장 SQL → 마이그 감싸기(옛 WHERE 를 새 출시 가드로 교체·새 출시 행 섞이면 중단·롤백에 DELETE 없음),
//          새 출시 18행 소급(SQL 파싱·앵커 판정 3상태·언급 집계·집계 없으면 칸 안 채움·행 수 불일치면 예외·롤백 원값), 정적 DB 접근 0.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { LEDGER_UPDATE_GUARD, renderLedgerSql } from '../lib/discovery/mention-loop.ts'
import { main as migrate, parseLedgerSql, renderRollback as ledgerRollback } from './mention-ledger-migrate.mjs'
import { baseName, classify, countMentions, plan, renderMigration, renderRollback, rowsFromSql } from './new-release-backfill.mjs'

let pass = 0
const t = (name, fn) => {
  fn()
  pass++
}

const OLD = `-- 언급 루프 대장 2026-10-21 — x
INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, mention_count, post_count, source_count, alt_seek_posts, evidence_input_ids, area_code, area_fit, gate_blocked, last_seen_at)
VALUES
  ('saas', 'ADP', 'w', NULL, NULL, NULL, 'unverified', 'lookup_failed: 앱 ID 없음', 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']::uuid[], '4', 1, NULL, '2026-10-21T00:00:00+09:00'),
  ('saas', 'O''Neil', 'w', NULL, NULL, NULL, 'unverified', 'r', 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000002']::uuid[], '2', 1, NULL, '2026-10-21T00:00:00+09:00')
ON CONFLICT (kind, lower(name)) DO UPDATE SET mention_count = EXCLUDED.mention_count
  WHERE public.discovery_candidates.origin = 'mention' AND public.discovery_candidates.verdict <> 'accepted';
`

t('대장 파싱: 이름·날짜, 옛 WHERE → 새 출시 가드', () => {
  const p = parseLedgerSql(OLD)
  assert.deepEqual(p.names, ['ADP', "O'Neil"])
  assert.equal(p.date, '2026-10-21')
  assert.ok(p.body.includes(`WHERE ${LEDGER_UPDATE_GUARD};`))
  assert.ok(!p.body.includes("verdict <> 'accepted';\n") || p.body.includes('새 출시 입력%'))
  assert.match(LEDGER_UPDATE_GUARD, /NOT LIKE '새 출시 입력%'/)
})
t('대장 파싱: 새 출시 행·ON CONFLICT 없음·날짜 여럿이면 중단, 빈 대장은 0행', () => {
  assert.throws(() => parseLedgerSql(OLD.replace(", 'mention', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']", ", 'new_release', 3, 3, 1, 0, ARRAY['00000000-0000-0000-0000-000000000001']")), /새 출시/)
  assert.throws(() => parseLedgerSql(OLD.replace(/ON CONFLICT[^\n]*\n/, '')), /ON CONFLICT/)
  assert.throws(() => parseLedgerSql(OLD.replace("'2026-10-21T00:00:00+09:00'),", "'2026-10-20T00:00:00+09:00'),")), /하나가 아니다/)
  assert.throws(() => parseLedgerSql('SELECT 1'), /형태가 아니다/)
  assert.deepEqual(parseLedgerSql('-- 대장 행 없음\n').names, [])
})
t('현재 renderLedgerSql 출력도 가드를 쓴다(두 벌 아님)', () => {
  const j = { key: 'inkwell', name: 'Inkwell', stage: 'candidate', reason: null, posts: ['00000000-0000-0000-0000-000000000003'], sources: ['appstore'], roles: { from: 0, to: 1, alt: 0, compare: 0 }, mentions: 1, alt_seek_posts: 0, area: '1', area_fit: 1 }
  const sql = renderLedgerSql([j], new Map(), new Set(), '2026-10-22')
  assert.ok(sql.includes(`WHERE ${LEDGER_UPDATE_GUARD};`))
  assert.equal(parseLedgerSql(sql).body, sql.trim())
})
t('대장 마이그: 드라이런은 파일 0, --write 는 본문+롤백, 롤백에 DELETE 없음', () => {
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
  assert.equal(ledgerRollback({ names: ['A'], date: '2026-10-21' }, 'x.sql').includes("NOT LIKE '새 출시 입력%'"), true)
})

// ── 새 출시 18행 소급 ──
const NR = `INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, area_code, last_seen_at)
SELECT v.* FROM (VALUES
  ('saas', 'Voice Recorder - Audio Record', 'w', 'appstore', 'gb:936694037', 9015, 'unverified', '새 출시 입력(chart) — x', 'new_release', '1', '2026-10-19T00:00:00+09:00'),
  ('saas', 'Klaviyo: Email Marketing & SMS', 'w', 'shopify_apps', 'app:klaviyo-email-marketing', NULL, 'unverified', '새 출시 입력(shopify) — x', 'new_release', '3', '2026-10-19T00:00:00+09:00'),
  ('saas', 'Gorgias: AI Helpdesk & Chat', 'w', 'shopify_apps', 'app:helpdesk', NULL, 'unverified', '새 출시 입력(shopify) — x', 'new_release', '2', '2026-10-19T00:00:00+09:00'),
  ('saas', 'EasyScan Inventory & Barcode', 'w', 'shopify_apps', 'app:easyscan-inventory-and-order', NULL, 'unverified', '새 출시 입력(shopify) — x', 'new_release', '2', '2026-10-19T00:00:00+09:00')
) AS v(kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, area_code, last_seen_at)
`
const rows = rowsFromSql(NR)
t('새 출시 SQL 파싱: 4행·숫자/NULL·따옴표', () => {
  assert.equal(rows.length, 4)
  assert.deepEqual([rows[0].probe_hits, rows[1].probe_hits, rows[0].probe_ref], [9015, null, 'gb:936694037'])
})
t('baseName', () => {
  assert.deepEqual(['Klaviyo: Email Marketing & SMS', 'Voice Recorder - Audio Record', 'Bundles.app ‑ Inventory Sync', 'MabangErp3'].map(baseName), ['Klaviyo', 'Voice Recorder', 'Bundles.app', 'MabangErp3'])
})
t('앵커 3상태: lookup 없으면 unverified(접지 않음) · 이름 맞으면 anchored · 핸들 불일치 ambiguous', () => {
  assert.equal(classify(rows[0]).state, 'unverified')
  const lk = new Map([['936694037', [{ trackId: 936694037, trackName: 'Voice Recorder - Audio Record', sellerName: 'LiveBird', userRatingCount: 17148 }]]])
  assert.equal(classify(rows[0], lk).state, 'anchored')
  const other = new Map([['936694037', [{ trackId: 936694037, trackName: 'Totally Different', sellerName: 'X', userRatingCount: 9 }]]])
  assert.equal(classify(rows[0], other).state, 'ambiguous')
  assert.deepEqual(rows.slice(1).map((r) => classify(r).state), ['anchored', 'ambiguous', 'anchored'])
  assert.equal(classify({ name: 'X', probe_source_key: 'googleplay', probe_ref: 'us:en:com.x' }).state, 'unverified')
})
t('언급 집계: 같은 추출기, 브랜드 토막으로도 셈', () => {
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
t('소급 계획·마이그: 표식 행만, 집계 없으면 칸 안 채움, 행 수 검사, 롤백 원값, DELETE 없음', () => {
  const p0 = plan([...rows, { name: 'Real Mention', verdict_reason: 'area_fit(2 1)' }])
  assert.equal(p0.length, 4)
  const m0 = renderMigration(p0, 'f.sql', { countsFrom: '없음' })
  assert.doesNotMatch(m0, /mention_count =/)
  assert.match(m0, /IF n <> 4 THEN RAISE EXCEPTION/)
  assert.match(m0, /origin = 'new_release'/)
  assert.match(m0, /verdict_reason NOT LIKE '%v71ba 소급%' AND human_review = 'pending'/)
  assert.doesNotMatch(m0, /verdict = /)
  const p1 = plan(rows, { posts: [{ id: 'x', source_key: 's', area_code: '3', raw_text: 'moved from Klaviyo to Omnisend' }] })
  const m1 = renderMigration(p1, 'f.sql', { countsFrom: 'x' })
  assert.match(m1, /mention_count = 0, post_count = 0/)
  assert.match(m1, /mention_count = 1, post_count = 1, source_count = 1, alt_seek_posts = 0, evidence_input_ids = ARRAY\['x'\]::uuid\[\], area_fit = 1/)
  assert.match(p1[2].verdict_reason, /^새 출시 입력\(shopify\) — x · v71ba 소급: ambiguous\(.*\) → 후보 기록만$/)
  const rb = renderRollback(p1, 'f.sql')
  assert.doesNotMatch(rb + m1, /DELETE|DROP/i)
  assert.ok(rb.includes("SET origin = 'mention', verdict_reason = '새 출시 입력(chart) — x', mention_count = NULL"))
})
t('정적: 두 스크립트 모두 DB 접근 0', () => {
  for (const f of ['mention-ledger-migrate.mjs', 'new-release-backfill.mjs']) {
    const src = fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, /@supabase|lib\/supabase|openDb|SERVICE_ROLE|rest\/v1|\.from\(|\.(insert|update|upsert|delete|rpc)\(/i, f)
  }
})
console.log(`mention-ledger selftest: ${pass} pass · 0 fail`)
