// 발행 크론 3개의 HTTP 상태 규칙 셀프테스트 — 실패는 실패로 보고한다(감사 09-19 치명 1-2).
//   node scripts/threads-cron-status-selftest.mjs
import fs from 'node:fs'
import path from 'node:path'
import { cronStatus } from '../lib/threads/cron-status.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) { pass++ } else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

t('실패 0건 → 200', cronStatus(0), 200)
t('실패 1건 → 500 (부분 실패도 실패다)', cronStatus(1), 500)
t('전건 실패 → 500', cronStatus(7), 500)

// 변이 테스트 — 라우트 3개가 전부 이 한 벌을 응답 status 에 쓴다. 하나라도 빠지면 다시 초록불이 된다.
const routes = ['collect-metrics', 'collect-replies', 'match-posts']
for (const r of routes) {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/api/threads', r, 'route.ts'), 'utf8')
  t(`${r}: cronStatus 를 import 한다`, /from '@\/lib\/threads\/cron-status'/.test(src), true)
  t(`${r}: 최종 응답 status 가 cronStatus(failed.length) 다`, /\{ status: cronStatus\(failed\.length\) \}/.test(src), true)
  t(`${r}: 응답 본문의 ok 도 그대로 둔다(부분 성공 내역 유지)`, /ok: failed\.length === 0/.test(src), true)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('크론 실패가 Vercel 에 초록으로 보인다.'); process.exit(1) }
console.log('크론 상태 규칙 정상 — 건 단위 실패가 1건이라도 있으면 500.')
