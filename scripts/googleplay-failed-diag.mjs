#!/usr/bin/env node
// 구글 플레이 failed 타깃 진단(v71ba P0-4) — 읽기 전용. DB 는 GET 만, 쓰기 0.
//
// failed 가 생기는 자리는 둘이다:
//   (a) 러너(lib/review/runner.ts) — 403·429·blockStatuses 가 아닌 HTTP ≥400 또는 요청 실패(status null)면 그 타깃을 failed 로 닫는다.
//       자동 되살리기(target-revive)는 exhausted 만 보므로 failed 는 영구 정지다.
//   (b) 후보 등록 롤백(scripts/candidate-register-draft.mjs renderRollback) — 그 마이그가 넣은 행을 failed 로 돌린다(자동 부활 대상 아님).
// 구분 표지: (b) 는 대개 한 번도 안 돌았다(last_run_at NULL ∧ total_collected 0). (a) 는 last_run_at 이 있다.
//
// --probe: 공개 상세 페이지(/store/apps/details — robots 허용 경로, batchexecute `/_` 가 아니다) 1회씩, 8초 간격, robots 를 매번 판정.
//   200 + 앱 표지 = 살아 있음(일시 오류였을 가능성 → 되살리기 후보) · 404 = 스토어에서 내려감(failed 유지) · 그 밖 = 확인 불가.
//   403·429 가 한 번이라도 나오면 즉시 멈춘다(우회 없음).
//
//   node --env-file=.env.local scripts/googleplay-failed-diag.mjs [--probe] [--json]
//   node scripts/googleplay-failed-diag.mjs --selftest
// 종료: 0 · 1(입력 실패) · 2(확인 불가 — DB 를 못 읽음) · 3(차단 신호로 중단)

import { pathToFileURL } from 'node:url'

export const GAP_MS = 8000
const PKG = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/

/** 실패 자리 추정. 행 칸만 본다(로그가 없다 — 실패 사유 문자열은 실행 요약에만 남는다). */
export function failureOrigin(t) {
  if (!t.last_run_at && !(t.total_collected > 0)) return 'never_ran' // (b) 등록 롤백 표지 또는 등록 직후 실패 전
  return 'runner_http_error' // (a)
}

/** 상세 페이지 응답 → alive | delisted | unverified. 200 이어도 앱 표지가 없으면 확인 불가(§7.1). */
export function judgeDetails(res, pkg) {
  if (!res || res.status === null || res.status === undefined) return 'unverified'
  if (res.status === 404) return 'delisted'
  if (res.status === 200 && typeof res.body === 'string' && res.body.includes(`id=${pkg}`) && /itemprop="name"|<h1[^>]*>/.test(res.body)) return 'alive'
  return 'unverified'
}

export function detailsUrl(ref) {
  const parts = String(ref).split(':')
  const [gl, hl, pkg] = parts.length === 3 ? parts : ['kr', 'ko', parts[0]]
  if (!PKG.test(pkg ?? '')) return null
  return { pkg, url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl.toUpperCase())}` }
}

function selftest() {
  const fails = []
  const t = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
  t('origin: 안 돈 행', failureOrigin({ last_run_at: null, total_collected: 0 }), 'never_ran')
  t('origin: 돈 행', failureOrigin({ last_run_at: '2026-10-20T00:00:00Z', total_collected: 0 }), 'runner_http_error')
  t('origin: 수집 있었던 행', failureOrigin({ last_run_at: null, total_collected: 5 }), 'runner_http_error')
  t('details: 404 = 내려감', judgeDetails({ status: 404, body: '' }, 'com.a.b'), 'delisted')
  t('details: 200 + 표지 = 살아 있음', judgeDetails({ status: 200, body: '<h1 x>App</h1> ?id=com.a.b&' }, 'com.a.b'), 'alive')
  t('details: 200 인데 표지 없음 = 확인 불가', judgeDetails({ status: 200, body: '<html>consent</html>' }, 'com.a.b'), 'unverified')
  t('details: 요청 실패 = 확인 불가', judgeDetails({ status: null, body: '' }, 'com.a.b'), 'unverified')
  t('details: 500 = 확인 불가', judgeDetails({ status: 500, body: '' }, 'com.a.b'), 'unverified')
  t('url: 3칸 ref', detailsUrl('us:en:com.notion.id')?.url, 'https://play.google.com/store/apps/details?id=com.notion.id&hl=en&gl=US')
  t('url: 패키지만 = kr:ko', detailsUrl('com.Slack')?.url, 'https://play.google.com/store/apps/details?id=com.Slack&hl=ko&gl=KR')
  t('url: 잘못된 패키지 = null', detailsUrl('kr:ko:../x'), null)
  if (fails.length) { console.error(`FAIL ${fails.length}\n  ${fails.join('\n  ')}`); process.exit(1) }
  console.log('googleplay-failed-diag selftest: PASS 11')
}

async function main(argv) {
  if (argv.includes('--selftest')) return selftest()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 — 확인 불가'); process.exit(2) }
  const r = await fetch(`${url}/rest/v1/review_targets?select=id,product_ref,label,status,consecutive_empty,total_collected,last_run_at,created_at,project_id&source_key=eq.googleplay&status=eq.failed&order=last_run_at.desc.nullslast`, { headers: { apikey: key, authorization: `Bearer ${key}` } })
  const rows = await r.json().catch(() => null)
  if (!r.ok || !Array.isArray(rows)) { console.error(`review_targets 조회 실패 HTTP ${r.status} — 확인 불가`); process.exit(2) }
  const out = rows.map((t) => ({ id: t.id, ref: t.product_ref, origin: failureOrigin(t), last_run_at: t.last_run_at, total_collected: t.total_collected, created_at: t.created_at, label: t.label, details: null }))
  let code = 0
  if (argv.includes('--probe')) {
    const { realFetch } = await import('./window-probe.mjs')
    const { robotsFor } = await import('./store-search-discovery.mjs')
    const memo = new Map()
    const rf = (u) => (memo.has(u) ? memo.get(u) : (memo.set(u, realFetch(u)), memo.get(u)))
    for (const o of out) {
      const d = detailsUrl(o.ref)
      if (!d) { o.details = 'bad_ref'; continue }
      const rob = await robotsFor(d.url, rf)
      if (rob !== 'allowed') { o.details = `robots ${rob} — 안 감`; continue }
      await new Promise((x) => setTimeout(x, GAP_MS))
      const res = await realFetch(d.url)
      if (res.status === 403 || res.status === 429) { o.details = `차단 ${res.status} — 전체 중단`; code = 3; break }
      o.details = judgeDetails(res, d.pkg)
    }
  }
  if (argv.includes('--json')) console.log(JSON.stringify(out, null, 2))
  else {
    const by = (k) => out.reduce((m, o) => ((m[o[k] ?? '—'] = (m[o[k] ?? '—'] ?? 0) + 1), m), {})
    console.log(`googleplay failed ${out.length}개 · 자리 ${JSON.stringify(by('origin'))} · 상세 ${JSON.stringify(by('details'))}`)
    for (const o of out) console.log(`- ${o.ref} · ${o.origin} · last_run ${o.last_run_at ?? '없음'} · 수집 ${o.total_collected ?? 0} · 상세 ${o.details ?? '미확인(--probe)'}`)
    console.log('되살리기 후보 = 상세 alive ∧ runner_http_error. failed→active 는 두 칸 UPDATE 초안을 따로 써서 오케스트레이터가 적용(§10.1 재방문 시계와 같은 칸·방향, 롤백 먼저).')
  }
  process.exit(code)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => { console.error(`❌ googleplay-failed-diag: ${e.message}`); process.exit(1) })
}
