// git push 재시도 — non-fast-forward 거부("fetch first")면 fetch + rebase 뒤 다시 push 한다. 최대 3회.
//
// 왜: 무인 루프 둘(daily-cmo-loop·transferability-digest)이 같은 main 에 밀어 넣는데, 한쪽이 checkout 한 뒤
//     다른 쪽이 먼저 push 하면 "! [rejected] main -> main (fetch first)" 로 끝났다(2026-09-25 실측, 권한 문제 아님).
//     커밋은 화이트리스트 경로(ops/state/ · reports/ …)만 건드려 리베이스 충돌 가능성이 낮다.
//
// 지키는 것
//   · 리베이스가 충돌하면 abort 하고 **재시도 없이** 실패로 돌려준다. 강제 push 는 어떤 경우에도 하지 않는다.
//     다음 실행이 같은 파일을 다시 만든다(전 단계 멱등).
//   · non-fast-forward 가 아닌 실패(권한·네트워크·보호 규칙)는 재시도하지 않는다 — 같은 결과가 반복될 뿐이다.
//   · 실행기(run)를 주입받는다 → selftest 가 git 없이 시나리오를 돈다.
//
// run(args) => Promise<{ code: number, stderr?: string, stdout?: string }>  (cmo-daily.mjs 의 sh('git', args) 와 같은 꼴)

export const REJECT_RE = /fetch first|non-fast-forward|\[rejected\]/i

export async function pushWithRetry(run, { tries = 3, identity = [], branch = 'main' } = {}) {
  let last = null
  for (let attempt = 1; attempt <= tries; attempt++) {
    last = await run(['push'])
    if (last.code === 0) return { ok: true, attempts: attempt }
    if (!REJECT_RE.test(last.stderr ?? '')) {
      return { ok: false, attempts: attempt, reason: `push 실패(재시도 대상 아님) — ${trim(last.stderr)}` }
    }
    const f = await run(['fetch', 'origin', branch])
    if (f.code !== 0) return { ok: false, attempts: attempt, reason: `fetch 실패 — ${trim(f.stderr)}` }
    const r = await run([...identity, 'rebase', `origin/${branch}`])
    if (r.code !== 0) {
      await run(['rebase', '--abort'])
      return { ok: false, attempts: attempt, rebaseConflict: true, reason: `rebase 충돌 — 재시도 없이 중단(강제 push 안 함). 다음 실행이 다시 커밋한다. ${trim(r.stderr)}` }
    }
  }
  return { ok: false, attempts: tries, reason: `push ${tries}회 재시도 후에도 거부 — ${trim(last?.stderr)}` }
}

const trim = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim().slice(-300)
