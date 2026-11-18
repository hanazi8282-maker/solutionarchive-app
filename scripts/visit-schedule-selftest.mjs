import assert from 'node:assert/strict'
import { planVisits, intervalDays, visitFilters, parseDisabledBatches } from '../lib/review/visit-schedule.ts'
const now = new Date('2026-11-19T00:00:00Z'), d = (n) => new Date(now.getTime() - n * 864e5).toISOString()
assert.equal(intervalDays(0), 1); assert.equal(intervalDays(3), 8); assert.equal(intervalDays(9), 14)
const base = { source_key: 's', status: 'active', total_collected: 0, dormant_at: null, last_review_at: null }
const rows = [
  { ...base, id: 'a', product_ref: 'x', consecutive_empty: 3, last_run_at: d(1) },
  { ...base, id: 'b', product_ref: 'y', consecutive_empty: 6, last_run_at: d(1) },
  { ...base, id: 'c', product_ref: 'url:z', status: 'exhausted', consecutive_empty: 0, last_run_at: d(1) },
  { ...base, id: 'n', product_ref: 'n', consecutive_empty: 9, last_run_at: null },
  ...Array.from({ length: 6 }, (_, i) => ({ ...base, id: 'k' + i, product_ref: 'k' + i, consecutive_empty: 0, last_run_at: d(1) })),
]
const { plans } = planVisits(rows, now)
assert.ok(plans.find((p) => p.id === 'a').next_visit_at > now.toISOString() && !plans.find((p) => p.id === 'a').dormant_at)
assert.ok(plans.find((p) => p.id === 'b').dormant_at, '연속 6회·조용함 → 휴면')
assert.ok(plans.find((p) => p.id === 'c').dormant_at, 'url: 한 편짜리 → 바로 휴면')
assert.ok(!plans.find((p) => p.id === 'n'), '한 번도 안 돈 타깃은 건드리지 않는다')
assert.deepEqual(parseDisabledBatches(' a, b ,'), ['a', 'b'])
assert.equal(visitFilters({ COLLECT_ONBOARD_DISABLED_BATCHES: 'onboard_x' }, now)[1], 'onboard_batch.is.null,onboard_batch.not.in.(onboard_x)')
assert.equal(visitFilters({ COLLECT_NEW_SOURCES_PAUSED: 'true' }, now)[1], 'onboard_batch.is.null')
assert.equal(visitFilters({}, now).length, 1)
console.log('visit-schedule selftest ok')
