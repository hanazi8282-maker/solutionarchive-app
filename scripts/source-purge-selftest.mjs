#!/usr/bin/env node
// 소스 단위 purge 셀프테스트 — 가짜 DB 클라이언트. 네트워크·실DB 없음.
import { main, purgeGuard, sourcePurgePatch, V70_OVERRIDE } from './source-purge.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const off = { key: 'x_forum', enabled: false, override: V70_OVERRIDE }

t('가드: 정상(dry-run)', purgeGuard({ source: 'x_forum', src: off, apply: false }).ok, true)
t('가드: 소스 없음', purgeGuard({ source: 'x_forum', src: null, apply: false }).ok, false)
t('가드: v70 소스가 아니면 거부(override 다름)', purgeGuard({ source: 'x_forum', src: { ...off, override: 'owner_2026-10-08' }, apply: false }).ok, false)
t('가드: override 없음도 거부', purgeGuard({ source: 'x_forum', src: { ...off, override: null }, apply: false }).ok, false)
t('가드: 켜져 있으면 거부', purgeGuard({ source: 'x_forum', src: { ...off, enabled: true }, apply: false }).ok, false)
t('가드: --apply 에 --confirm 없으면 거부', purgeGuard({ source: 'x_forum', src: off, apply: true, confirm: undefined }).ok, false)
t('가드: confirm 이 다른 키면 거부', purgeGuard({ source: 'x_forum', src: off, apply: true, confirm: 'other' }).ok, false)
t('가드: apply + 같은 confirm = 허용', purgeGuard({ source: 'x_forum', src: off, apply: true, confirm: 'x_forum' }).ok, true)
t('가드: 이상한 키(주입 시도) 거부', purgeGuard({ source: "x'; drop table", src: off, apply: false }).ok, false)

const now = new Date('2026-10-14T00:00:00Z')
t('패치: 새 폐기는 사유 source_purge', sourcePurgePatch(now, false), { raw_text: null, purged_at: '2026-10-14T00:00:00.000Z', purge_reason: 'source_purge' })
t('패치: 이미 폐기된 행은 원문만(사유 보존)', sourcePurgePatch(now, true), { raw_text: null })

function fakeSb({ src, rows }) {
  const state = { rows: rows.map((r) => ({ ...r, raw_text: 'x' })), updates: [] }
  const q = (table) => {
    const ctx = { table, filters: [], upd: null, head: false, count: false }
    const api = {
      select(_c, o) { ctx.head = !!o?.head; ctx.count = !!o?.count; return api },
      eq(c, v) { ctx.filters.push([c, v]); return api },
      not() { ctx.filters.push(['notnull']); return api },
      limit() { return api },
      update(p) { ctx.upd = p; return api },
      maybeSingle() { return Promise.resolve({ data: table === 'review_sources' && ctx.filters[0]?.[1] === src?.key ? src : null, error: null }) },
      then(res) {
        if (ctx.upd) {
          const id = ctx.filters.find((f) => f[0] === 'id')[1]
          const r = state.rows.find((x) => x.id === id)
          Object.assign(r, ctx.upd)
          state.updates.push({ id, patch: ctx.upd })
          return res({ error: null })
        }
        const live = state.rows.filter((r) => r.raw_text !== null)
        return res(ctx.head ? { count: live.length, error: null } : { data: live.map((r) => ({ id: r.id, purged_at: r.purged_at ?? null })), error: null })
      },
    }
    return api
  }
  return { sb: { from: q }, state }
}
{
  const f = fakeSb({ src: off, rows: [{ id: 'a' }, { id: 'b', purged_at: '2026-10-01T00:00:00Z', purge_reason: 'retention' }] })
  const r = await main(['--source=x_forum'], { sb: f.sb, now, log: () => {} })
  t('dry-run: 후보 2 · 폐기 0 · 업데이트 0', [r.ok, r.candidates, r.purged, f.state.updates.length], [true, 2, 0, 0])
}
{
  const f = fakeSb({ src: off, rows: [{ id: 'a' }, { id: 'b', purged_at: '2026-10-01T00:00:00Z', purge_reason: 'retention' }] })
  const r = await main(['--source=x_forum', '--apply', '--confirm=x_forum'], { sb: f.sb, now, log: () => {} })
  t('apply: 2행 폐기 · 남은 원문 0', [r.ok, r.purged, r.remaining], [true, 2, 0])
  t('apply: 새 행은 source_purge, 기존 retention 행은 원문만', [f.state.updates[0].patch.purge_reason, f.state.updates[1].patch.purge_reason], ['source_purge', undefined])
}
{
  const f = fakeSb({ src: { ...off, enabled: true }, rows: [{ id: 'a' }] })
  const r = await main(['--source=x_forum', '--apply', '--confirm=x_forum'], { sb: f.sb, now, log: () => {} })
  t('켜진 소스는 apply 해도 0행', [r.ok, f.state.updates.length], [false, 0])
}
{
  const f = fakeSb({ src: { key: 'danawa', enabled: false, override: null }, rows: [{ id: 'a' }] })
  const r = await main(['--source=danawa', '--apply', '--confirm=danawa'], { sb: f.sb, now, log: () => {} })
  t('v70 가 아닌 소스는 거부 · 0행', [r.ok, f.state.updates.length], [false, 0])
}

console.log(`source-purge selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
