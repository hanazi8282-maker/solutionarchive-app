// git push 재시도 셀프테스트 — git 없이 가짜 실행기로 시나리오를 돈다.
//   node scripts/git-push-retry-selftest.mjs
import { pushWithRetry } from './git-push-retry.mjs'

let pass = 0, fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${g}\n      want=${w}`) }
}

const REJECT = { code: 1, stderr: 'To github.com:x/y\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs' }
const OK = { code: 0 }

/** 호출 순서를 기록하고, 명령 종류별로 미리 정한 응답을 차례로 돌려주는 가짜 git. */
function fake(script) {
  const calls = []
  const run = async (args) => {
    calls.push(args.filter((a) => !a.startsWith('-c') && !a.startsWith('user.')).join(' '))
    const key = args.includes('rebase') ? (args.includes('--abort') ? 'abort' : 'rebase') : args[0]
    const q = script[key] ?? []
    return q.length ? q.shift() : OK
  }
  return { run, calls }
}

// 1) 첫 push 성공 → 재시도 없음
{
  const g = fake({ push: [OK] })
  const r = await pushWithRetry(g.run)
  t('첫 push 성공', r, { ok: true, attempts: 1 })
  t('첫 push 성공 — fetch/rebase 안 함', g.calls, ['push'])
}
// 2) 거부 → fetch+rebase → 성공
{
  const g = fake({ push: [REJECT, OK] })
  const r = await pushWithRetry(g.run, { identity: ['-c', 'user.name=bot'] })
  t('거부 뒤 rebase 후 성공', r, { ok: true, attempts: 2 })
  t('순서: push → fetch → rebase → push', g.calls, ['push', 'fetch origin main', 'rebase origin/main', 'push'])
}
// 3) 거부 → rebase 충돌 → abort, 재시도 없음, 강제 push 없음
{
  const g = fake({ push: [REJECT, OK, OK], rebase: [{ code: 1, stderr: 'CONFLICT (content): Merge conflict in ops/state/x.json' }] })
  const r = await pushWithRetry(g.run)
  t('rebase 충돌 → ok=false·rebaseConflict', [r.ok, r.rebaseConflict, r.attempts], [false, true, 1])
  t('rebase 충돌 → abort 하고 push 다시 안 함', g.calls, ['push', 'fetch origin main', 'rebase origin/main', 'rebase --abort'])
  t('rebase 충돌 사유에 "강제 push 안 함"', /강제 push 안 함/.test(r.reason), true)
  t('어떤 경우에도 --force 없음', g.calls.some((c) => /force/.test(c)), false)
}
// 4) non-fast-forward 가 아닌 실패(권한 등) → 재시도 없음
{
  const g = fake({ push: [{ code: 128, stderr: 'remote: Permission to x/y denied' }, OK] })
  const r = await pushWithRetry(g.run)
  t('권한 오류는 재시도 안 함', [r.ok, r.attempts], [false, 1])
  t('권한 오류 — fetch 안 함', g.calls, ['push'])
}
// 5) 3회 연속 거부 → 실패
{
  const g = fake({ push: [REJECT, REJECT, REJECT, OK] })
  const r = await pushWithRetry(g.run)
  t('3회 거부 → ok=false attempts=3', [r.ok, r.attempts], [false, 3])
  t('3회 거부 — push 정확히 3번', g.calls.filter((c) => c === 'push').length, 3)
}
// 6) fetch 실패 → 즉시 실패
{
  const g = fake({ push: [REJECT], fetch: [{ code: 1, stderr: 'could not resolve host' }] })
  const r = await pushWithRetry(g.run)
  t('fetch 실패 → 즉시 실패', [r.ok, r.attempts, /fetch 실패/.test(r.reason)], [false, 1, true])
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('push 재시도가 충돌을 억지로 밀거나, 재시도하면 안 되는 실패를 반복한다.'); process.exit(1) }
console.log('push 재시도 정상 — 거부만 재시도, 충돌은 abort, 강제 push 없음.')
