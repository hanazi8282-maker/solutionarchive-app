#!/usr/bin/env node
// v71ba P0-2 — 언급 후보 상위 N(기본 30)개를 경로별로 얼마나 앱 ID 로 해소하는지 잰다. DB·Search 없음(드라이런). 원문 조각은 내지 않는다(이름·건수만).
//   node scripts/mention-resolve-dryrun.mjs --input=<mention-input.json> [--n=30] [--min-posts=2] [--dictionary=<chart-dict.json>] [--lookup] [--homepage] [--out=<md>]
//   표본 = 언급 루프와 같은 집계·제외 규칙 → 후보(candidate·area_fit) 점수 순 상위 N. 3글 기준으로 N 이 안 차면 --min-posts(기본 2)로 내려 채운다.
//   경로: ①링크(근거 글의 apps.apple.com·play.google.com 링크) ②사전(차트 사전) ③홈페이지(근거 글에 적힌 주소, --homepage 면 실제로 읽음)
//   --lookup 이면 ①~③ 의 앱 ID 를 iTunes /lookup 으로 이름 대조(anchored)까지 본다. Search(4번)는 이 측정에 쓰지 않는다 — 한도를 아낀다.
// 종료 코드: 0 · 1(입력 실패)
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { aggregate, filterPool, homepageCandidates, judge, verifyCandidate } from '../lib/discovery/mention-loop.ts'
import { normKey, loadConfig, loadFileRegistry } from './product-name-candidates.mjs'
import { homepageAnchors, liveLookups, unwrap } from './mention-loop.mjs'

/** 순수 — 판정 행에서 상위 n. 기준 글 수를 3 → minPosts 로 내리며 채운다. */
export function pickTop(rows, prior, { n = 30, minPosts = 2 } = {}) {
  for (let k = 3; k >= minPosts; k--) {
    const live = rows.map((a) => judge(a, { minPosts: k, prior })).filter((j) => j.stage === 'candidate' || j.stage === 'area_fit')
    if (live.length >= n || k === minPosts) return { k, sample: live.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1)).slice(0, n) }
  }
}

export async function main(argv, { log = console.log, fetchFn = fetch, fileRegistry = loadFileRegistry(), cfg = loadConfig() } = {}) {
  const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
  if (!opt('input')) throw new Error('--input=<mention-input.json> 필요')
  const input = unwrap(JSON.parse(fs.readFileSync(opt('input'), 'utf8')))
  input.posts = filterPool(input.posts, 'wide')
  const prior = new Map(input.discovery.filter((d) => d.verdict === 'rejected').map((d) => [normKey(d.name), 'rejected']))
  const { rows } = aggregate(input.posts, { ...input, ...fileRegistry, exclude: { ...cfg.exclude, ...cfg.mention_exclude } })
  const n = Number(opt('n') ?? 30)
  const { k, sample } = pickTop(rows, prior, { n, minPosts: Number(opt('min-posts') ?? 2) })
  const link = new Set(sample.filter((j) => j.app_ids.length || j.play_pkgs?.length).map((j) => j.key))
  const dict = opt('dictionary') ? JSON.parse(fs.readFileSync(opt('dictionary'), 'utf8')).dictionary ?? {} : {}
  const dictHit = new Set(sample.filter((j) => !link.has(j.key) && dict[j.key]).map((j) => j.key))
  for (const j of sample) if (dictHit.has(j.key)) j.app_ids.push(...dict[j.key].map((h) => String(h.id)))
  const rawById = new Map(input.posts.map((p) => [p.id, p.raw_text]))
  const homeUrls = new Map(sample.filter((j) => !j.app_ids.length && !j.play_pkgs?.length).map((j) => [j.key, homepageCandidates(j, rawById, input.discovery, normKey)]).filter(([, u]) => u.length))
  const homeHit = new Set()
  let homeReq = 0
  if (argv.includes('--homepage')) {
    const h = await homepageAnchors([...new Set([...homeUrls.values()].flat())], { fetchFn, log })
    homeReq = h.requests
    for (const [key, urls] of homeUrls) for (const u of urls) {
      const id = h.out.get(u)?.appstore_id
      if (id) { sample.find((j) => j.key === key).app_ids.push(id); homeHit.add(key) }
    }
  }
  let anchoredBy = null
  if (argv.includes('--lookup')) {
    const { out } = await liveLookups([...new Set(sample.flatMap((j) => j.app_ids))], { fetchFn, max: 60, log })
    const st = (j) => verifyCandidate(j, { lookups: out }).state
    anchoredBy = { link: sample.filter((j) => link.has(j.key) && st(j) === 'anchored').length, dictionary: sample.filter((j) => dictHit.has(j.key) && st(j) === 'anchored').length, homepage: sample.filter((j) => homeHit.has(j.key) && st(j) === 'anchored').length }
  }
  const res = { n: sample.length, min_posts: k, link: link.size, dictionary: dictHit.size, homepage_urls: homeUrls.size, homepage: argv.includes('--homepage') ? homeHit.size : null, homepage_requests: homeReq, anchored_by: anchoredBy, unresolved: sample.filter((j) => !j.app_ids.length && !j.play_pkgs?.length).length, names: sample.map((j) => ({ name: j.name, posts: j.posts.length, stage: j.stage, path: link.has(j.key) ? 'link' : dictHit.has(j.key) ? 'dictionary' : homeHit.has(j.key) ? 'homepage' : homeUrls.has(j.key) ? 'homepage_url_only' : 'none' })) }
  log(`[해소 드라이런] 상위 ${res.n}(기준 ${k}글) · 링크만으로 ID 확보 ${res.link}/${res.n}${anchoredBy ? ` (lookup 이름 대조 anchored ${anchoredBy.link})` : ''} · +사전 ${res.dictionary} · +홈페이지 ${res.homepage ?? '안 읽음'}(주소 있는 후보 ${res.homepage_urls}) · 못 찾음 ${res.unresolved}`)
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(res, null, 1) + '\n')
  return res
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ mention-resolve-dryrun: ${e.message}`)
    process.exit(1)
  })
}
