#!/usr/bin/env node
// [v71cu S8-2] youtube-expand 셀프테스트 — 네트워크·DB 없이 가짜 의존성으로: 키 파싱, 쿼터 경계(초과 0회), 403 즉시 중단, 중복·댓글 적은 영상 스킵.
import { parseQueryRef, uploadsPlaylistId, makeQuota, expand } from '../lib/review/youtube-expand.ts'
import { parseChannelRef } from '../lib/review/adapters/youtube.ts'

let fail = 0
const ok = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name) } }
const CH = 'UC' + 'a'.repeat(22)
const vid = (n) => String(n).padStart(11, 'x')

// 키 파싱
ok('q: 정상', parseQueryRef('q:Stripe  후기') === 'Stripe 후기')
ok('q: 대소문자', parseQueryRef('Q:hello world') === 'hello world')
ok('q: 빈값 null', parseQueryRef('q:  ') === null && parseQueryRef('v:abc') === null)
ok('q: 101자 null', parseQueryRef('q:' + 'a'.repeat(101)) === null)
ok('ch: 정상', parseChannelRef(`ch:${CH}`) === CH && parseChannelRef('ch:UCshort') === null)
ok('uploads 재생목록', uploadsPlaylistId(CH) === 'UU' + 'a'.repeat(22))

const memStore = (init = { search: 0, other: 0 }) => { const u = { ...init }; const sets = []; return { u, sets, get: async (b) => u[b], set: async (b, n, l) => { u[b] = n; sets.push([b, n, l]) } } }

// 쿼터 경계: 한도 3이면 4번째 reserve 는 false, 기록은 3까지만
{
  const s = memStore(); const q = makeQuota(s, { search: 3, other: 5 })
  const r = []; for (let i = 0; i < 5; i++) r.push(await q.reserve('search'))
  ok('search 3회까지만 true', JSON.stringify(r) === '[true,true,true,false,false]')
  ok('기록 used 가 한도를 넘지 않는다', s.u.search === 3 && s.sets.every(([, n, l]) => n <= l))
  const s2 = memStore({ search: 24, other: 0 }); const q2 = makeQuota(s2, { search: 25, other: 5 })
  ok('이미 24 사용 → 1회만 더', (await q2.reserve('search')) === true && (await q2.reserve('search')) === false)
}

const mkDeps = (over = {}) => {
  const calls = []; const registered = []
  const store = over.store ?? memStore()
  const deps = {
    quota: makeQuota(store, over.caps ?? { search: 60, other: 1800 }),
    maxNewVideos: over.maxNew ?? 40,
    existing: async (refs) => new Set(refs.filter((r) => (over.dup ?? []).includes(r))),
    register: async (v) => { registered.push(v.videoId); return true },
    fetchJson: async (url) => {
      calls.push(url)
      if (over.status) { const st = over.status(calls.length, url); if (st) return { status: st, json: {} } }
      if (url.includes('/search?')) return { status: 200, json: { items: [1, 2, 3].map((n) => ({ id: { videoId: vid(n) } })) } }
      if (url.includes('/playlistItems?')) return { status: 200, json: { items: [1, 2, 3].map((n) => ({ contentDetails: { videoId: vid(n) } })) } }
      // videos.list: 1번 댓글 100, 2번 댓글 5, 3번 댓글 꺼짐(commentCount 없음)
      return { status: 200, json: { items: [{ id: vid(1), statistics: { commentCount: '100' } }, { id: vid(2), statistics: { commentCount: '5' } }, { id: vid(3), statistics: {} }] } }
    },
  }
  return { deps, calls, registered, store }
}
const T = [{ id: 't1', projectId: 'p', productRef: 'q:stripe 후기', label: 'pay:x' }, { id: 't2', projectId: 'p', productRef: `ch:${CH}`, label: 'pay:x' }]

// 정상: q 는 search 1 + videos 1, ch 는 playlist 1 + videos 1. 댓글 적음/꺼짐 스킵, 같은 영상은 dup 로 스킵
{
  const { deps, registered, calls } = mkDeps({ dup: [`v:${vid(1)}`] })
  const r = await expand(T, deps)
  ok('호출 수 search 1·other 3', r.calls.search === 1 && r.calls.other === 3 && calls.length === 4)
  ok('중복 영상은 등록 안 함', registered.length === 0 && r.skippedDup === 2)
  ok('댓글 적음·꺼짐 스킵 4건', r.skippedFewComments === 4)
  ok('touched 2', r.touched.length === 2 && r.stopped === null)
}
{
  const { deps, registered } = mkDeps()
  const r = await expand([T[0]], deps)
  ok('댓글 30+ 만 등록', registered.length === 1 && registered[0] === vid(1) && r.registered === 1)
}
// 한도 0 → 호출 0회, 중단
{
  const { deps, calls } = mkDeps({ caps: { search: 0, other: 10 } })
  const r = await expand(T, deps)
  ok('search 한도 0 → fetch 0회·중단 사유', calls.length === 0 && /search/.test(r.stopped))
}
// other 한도 1: ch 의 playlist 1회 후 videos.list 에서 중단, 초과 호출 0
{
  const { deps, calls, store } = mkDeps({ caps: { search: 5, other: 1 } })
  const r = await expand([T[1]], deps)
  ok('other 한도 1 → 호출 1회뿐', calls.length === 1 && store.u.other === 1 && /other/.test(r.stopped))
}
// 403 즉시 중단 — 이후 호출 없음(재시도·우회 없음)
{
  const { deps, calls } = mkDeps({ status: (n) => (n === 1 ? 403 : 0) })
  const r = await expand(T, deps)
  ok('403 → 1회에서 끝', calls.length === 1 && /403/.test(r.stopped) && r.touched.length === 0)
  const m = mkDeps({ status: (n) => (n === 2 ? 429 : 0) })
  const r2 = await expand(T, m.deps)
  ok('429 → videos.list 에서 즉시 중단', m.calls.length === 2 && /429/.test(r2.stopped))
}
// maxNew 상한 + 해석 불가 키 건너뜀
{
  const { deps, calls } = mkDeps({ maxNew: 0 })
  ok('maxNew 0 → 호출 없음', (await expand(T, deps)).calls.search === 0 && calls.length === 0)
  const m = mkDeps()
  const r = await expand([{ id: 'x', projectId: 'p', productRef: 'q:', label: 'l' }], m.deps)
  ok('해석 불가 키는 호출 0', m.calls.length === 0 && r.stopped === null)
}
// 키는 fetchJson 인자 URL 에 없다(스크립트가 붙임)
{
  const { deps, calls } = mkDeps(); await expand([T[0]], deps)
  ok('URL 에 key= 없음(로그 노출 방지)', calls.every((u) => !u.includes('key=')))
}
console.log(fail ? `youtube-expand selftest: ${fail} FAIL` : 'youtube-expand selftest: all pass')
process.exit(fail ? 1 : 0)
