#!/usr/bin/env node
// 국내 근태·HR 앱 사업자등록번호 → 국세청 상태조회 → kr_closed 적재(v71ci A7 / v71ck 2).
//   node --env-file=.env.local scripts/kr-closed-check.mjs [--dry]
// 번호는 각 사 공개 홈페이지(푸터·약관·개인정보처리방침 링크 1단계)에 적힌 것만 읽는다. 원자료는 DB 에만(공개 리포 금지). 키 값은 출력하지 않는다.
// 휴·폐업(b_stt_cd 02·03)인 회사만 kr_closed 로 넣는다(계속사업자는 조회 결과 요약만 로그).
import { createClient } from '@supabase/supabase-js'
const dry = process.argv.includes('--dry')
const CANDIDATES = [
  ['시프티', 'https://shiftee.io'], ['플렉스', 'https://flex.team'], ['샵플', 'https://shopl.io'], ['하이웍스', 'https://www.hiworks.com'],
  ['두레이', 'https://dooray.com'], ['네이버웍스', 'https://naver.worksmobile.com'], ['페이워크', 'https://paywork.io'], ['위하고', 'https://www.wehago.com'],
  ['인사킹', 'https://www.insaking.com'], ['알밤', 'https://albam.io'], ['핸디', 'https://handy.kr'], ['잡다', 'https://jobda.im'],
  ['굿모닝HR', 'https://gdmhr.com'], ['시프티플러스', 'https://www.shiftee.io/ko'], ['캐치', 'https://catch.co.kr'], ['인사이트HR', 'https://www.insightcorp.co.kr'],
]
const BRN = /(\d{3})-(\d{2})-(\d{5})/g
const get = async (u) => { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); return r.ok ? await r.text() : '' } catch { return '' } }
const robotsOk = async (u) => { const t = await get(new URL('/robots.txt', u).href); return !/^\s*Disallow:\s*\/\s*$/m.test(t) }
const found = []
for (const [name, url] of CANDIDATES) {
  if (!(await robotsOk(url))) { console.log(`· ${name}: robots 금지 — 건너뜀`); continue }
  const home = await get(url)
  const links = [...home.matchAll(/href="([^"]*(?:terms|privacy|policy|company|about)[^"]*)"/gi)].map((m) => { try { return new URL(m[1], url).href } catch { return null } }).filter(Boolean).slice(0, 2)
  let txt = home
  for (const l of links) txt += ' ' + (await get(l))
  const m = [...txt.matchAll(/사업자\s*(?:등록)?\s*번호[^0-9]{0,12}(\d{3}-\d{2}-\d{5})/g)].map((x) => x[1])
  const one = m[0] ?? [...txt.matchAll(BRN)].map((x) => x[0])[0]
  console.log(one ? `✓ ${name}: 번호 확인` : `· ${name}: 번호를 공개 푸터에서 못 찾음`)
  if (one) found.push({ name, url, brn: one.replace(/-/g, '') })
}
console.log(`번호 확보 ${found.length}/${CANDIDATES.length}`)
if (!found.length) process.exit(0)
const key = process.env.NTS_BIZ_API_KEY
if (!key) { console.error('키 위치 불명(NTS_BIZ_API_KEY)'); process.exit(2) }
const r = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${key.includes("%") ? key : encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ b_no: found.map((f) => f.brn) }) })
if (!r.ok) { console.error(`NTS 조회 실패 HTTP ${r.status}`); process.exit(2) }
const out = (await r.json()).data ?? []
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
let closed = 0
for (const f of found) {
  const s = out.find((o) => o.b_no === f.brn)
  const cd = s?.b_stt_cd ?? ''
  console.log(`  ${f.name}: ${s?.b_stt || '(조회 결과 없음)'}${cd ? ` [${cd}]` : ''}`)
  if (cd === '02' || cd === '03') {
    closed++
    if (!dry) {
      const { error } = await sb.from('kr_closed').upsert({ source: 'nts', source_key: f.brn, company: f.name, closed_on: s.end_dt ? `${s.end_dt.slice(0, 4)}-${s.end_dt.slice(4, 6)}-${s.end_dt.slice(6, 8)}` : null, reason: s.b_stt, url: f.url, sector: '근태·HR', extra: { b_stt_cd: cd, tax_type: s.tax_type ?? null } }, { onConflict: 'source,source_key' })
      if (error) { console.error(`적재 실패: ${error.message}`); process.exit(2) }
    }
  }
}
console.log(`휴·폐업 ${closed}건 ${dry ? '(dry)' : '적재'}`)
