import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
const out = process.env.PROBE_DIR
fs.mkdirSync(out, { recursive: true })
const sb = await createClient()
const pageAll = async (build) => {
  const rows = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build().range(f, f + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}
const targets = await pageAll(() => sb.from('review_targets').select('label, source_key, product_ref, project_id').in('source_key', ['appstore', 'googleplay']).order('id'))
fs.writeFileSync(`${out}/targets.json`, JSON.stringify(targets))
const { data: srcs, error } = await sb.from('review_sources').select('key, enabled, override, robots_status, min_interval_ms').in('key', ['appstore', 'googleplay'])
if (error) throw new Error(error.message)
fs.writeFileSync(`${out}/sources.json`, JSON.stringify(srcs))
let fps
try {
  fps = await pageAll(() => sb.from('review_fingerprints').select('identity_key, content_hash').in('source_key', ['appstore', 'googleplay']).order('id'))
} catch (e) {
  console.log('fingerprint filter failed:', e.message)
  process.exit(2)
}
fs.writeFileSync(`${out}/seen.json`, JSON.stringify({ identity_keys: fps.map((r) => r.identity_key), legacy_identity_keys: [], content_hashes: fps.map((r) => r.content_hash).filter(Boolean) }))
console.log('targets', targets.length, 'sources', srcs.length, 'fingerprints', fps.length)
