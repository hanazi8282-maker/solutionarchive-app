#!/usr/bin/env node
// 비공개 결론서 링크 `/r/{token}` 관리 — 게시 · 회수 · 열람 추정 조회. 절차 문서: ops/report-pages.md
//
//   node scripts/report-pages.mjs publish <결론서.html> --company <slug> [--version N] [--reveal]
//   node scripts/report-pages.mjs revoke  --company <slug> [--version N]     # 버전 생략 = 그 회사 전부
//   node scripts/report-pages.mjs views   --company <slug>
//
// 지키는 것
//   · 키는 .env.local 의 SUPABASE_SERVICE_ROLE_KEY. 값을 출력·로그하지 않는다(오류 메시지에도 안 넣는다).
//   · 게시 출력은 URL 꼴 + 마스킹(앞 4자). 전체 URL 은 --reveal 일 때만 한 번 찍는다 — 발송은 남헌 건별 승인 뒤.
//   · 회수는 revoked_at 설정(soft) — 그 즉시 라우트가 404(없음과 같은 응답). 행을 지우지 않는다.
//   · 열람 수는 "열람 추정"이다. A등급이 아닌 추정치(bot 제외 · 같은 토큰 10분 내 1회 합산, lib/report-pages/core.ts).
//
// 종료 코드: 0 정상 · 2 인자/설정/DB 오류

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { newToken, maskedUrl, estimateViews, TOKEN_RE } from '../lib/report-pages/core.ts'

const BASE_URL = 'https://solutionarch.vercel.app'
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(2) }

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined }
const has = (name) => rest.includes(`--${name}`)
const company = flag('company')
const versionArg = flag('version')
const version = versionArg === undefined ? undefined : Number(versionArg)

if (!['publish', 'revoke', 'views'].includes(cmd)) die('사용: report-pages.mjs publish <html> --company <slug> [--version N] [--reveal] | revoke --company <slug> [--version N] | views --company <slug>')
if (!company || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(company)) die('--company <slug> 필요(소문자·숫자·하이픈)')
if (version !== undefined && !(Number.isInteger(version) && version >= 1)) die('--version 은 1 이상 정수')

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다(.env.local). 시작하지 않는다.')
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const dbErr = (what, e) => die(`${what} 실패: ${e.code ?? ''} ${e.message}`)

if (cmd === 'publish') {
  const file = rest[0]
  if (!file || file.startsWith('--') || !existsSync(file)) die('결론서 HTML 파일 경로가 없다')
  const html = readFileSync(file, 'utf8')
  if (!html.trim()) die('빈 파일이다')
  if (html.length > 2_000_000) die('2MB 초과 — DB CHECK 상한')
  let v = version
  if (v === undefined) {
    const { data, error } = await sb.from('report_pages').select('version').eq('company_slug', company)
      .order('version', { ascending: false }).limit(1)
    if (error) dbErr('버전 조회', error)
    v = (data?.[0]?.version ?? 0) + 1
  }
  const token = newToken()
  if (!TOKEN_RE.test(token)) die('토큰 형식 이상')
  const { error } = await sb.from('report_pages').insert({ token, company_slug: company, version: v, html })
  if (error) dbErr('게시', error)
  console.log(`게시: ${company} v${v} → ${maskedUrl(BASE_URL, token)}`)
  if (has('reveal')) console.log(`전체 URL(발송 전 남헌 승인 필요): ${BASE_URL}/r/${token}`)
  else console.log('전체 URL 은 ops/report-pages.md 의 조회 SQL 로 확인한다(발송은 남헌 건별 승인 뒤).')
}

if (cmd === 'revoke') {
  let q = sb.from('report_pages').update({ revoked_at: new Date().toISOString() })
    .eq('company_slug', company).is('revoked_at', null)
  if (version !== undefined) q = q.eq('version', version)
  const { data, error } = await q.select('version')
  if (error) dbErr('회수', error)
  console.log(`회수: ${company} ${data.length}건 (${data.map((r) => `v${r.version}`).join(', ') || '대상 없음'}) — 즉시 404`)
}

if (cmd === 'views') {
  const { data: pages, error } = await sb.from('report_pages').select('token, version, created_at, revoked_at')
    .eq('company_slug', company).order('version')
  if (error) dbErr('조회', error)
  if (!pages.length) die(`${company} 게시 행 없음`)
  for (const p of pages) {
    const { data: rows, error: e } = await sb.from('report_views').select('viewed_at, kind').eq('token', p.token)
    if (e) dbErr('열람 조회', e)
    const bots = rows.filter((r) => r.kind === 'bot').length
    console.log(`v${p.version} ${p.revoked_at ? '회수됨' : '게시중'} · 열람 추정 ${estimateViews(rows)}회 (A등급 아닌 추정치 · bot ${bots}건 제외)`)
  }
}
