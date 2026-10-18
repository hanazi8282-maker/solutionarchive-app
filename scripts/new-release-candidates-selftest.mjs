import { extractStoreIds, parsePhPosts, recentLaunches } from '../lib/discovery/new-release.ts'
import { main } from './new-release-candidates.mjs'

let pass = 0
let fail = 0
const t = (n, a, e) => {
  const ok = JSON.stringify(a) === JSON.stringify(e)
  if (ok) pass++
  else {
    fail++
    console.log(`❌ ${n} — 기대 ${JSON.stringify(e)} / 실제 ${JSON.stringify(a)}`)
  }
}
delete process.env.PRODUCT_HUNT_API_TOKEN
const ph = { data: { posts: { edges: [{ node: { name: 'Acme Notes', tagline: 't', website: 'https://acme.test', votesCount: 9, createdAt: '2026-10-01T00:00:00Z', topics: { edges: [{ node: { name: 'Productivity' } }] } } }, { node: { name: '' } }] } } }
const l = parsePhPosts(ph)
t('PH 파싱: 이름 없는 노드는 버린다', l.map((x) => [x.name, x.topics]), [['Acme Notes', ['Productivity']]])
let threw = false
try {
  parsePhPosts({ data: {} })
} catch {
  threw = true
}
t('PH 파싱: edges 없으면 던진다(빈 목록과 구분)', threw, true)
t('90일 필터', [recentLaunches(l, new Date('2026-10-19')).length, recentLaunches(l, new Date('2027-03-01')).length], [1, 0])
t('앵커: 스마트 배너 메타', extractStoreIds('<meta name="apple-itunes-app" content="app-id=123456789, app-argument=x">').appstore_id, '123456789')
t('앵커: 배지 링크', extractStoreIds('<a href="https://apps.apple.com/us/app/acme/id987654321">').appstore_id, '987654321')
t('앵커: Play 패키지', extractStoreIds('<a href="https://play.google.com/store/apps/details?id=com.acme.notes&hl=en">').play_pkg, 'com.acme.notes')
t('앵커: 없으면 둘 다 null', extractStoreIds('<html></html>'), { appstore_id: null, play_pkg: null })
const noTok = await main([], { log: () => {} })
t('토큰 없으면 확인 불가(0건으로 접지 않음)', noTok.state, 'unavailable')
console.log(`new-release selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
