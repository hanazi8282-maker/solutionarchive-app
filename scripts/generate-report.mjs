#!/usr/bin/env node
// 결론서 배치 생성기(v71cj 작업 5) — 콜드메일용 전 장(1~6+부록) 결론서를 한 곳씩 만든다. 발송은 하지 않는다(자동 발송 금지).
//   node --env-file=.env.local scripts/generate-report.mjs --company 회사명 --url https://… --liner "한 줄 설명" --out <dir> [--owner you@x.com] [--preset cold|paid|free]
// 출력: <out>/<slug>.html(공개 /r/{token} 렌더 그대로) · <slug>.pdf(Chrome 인쇄) · <slug>.json(토큰·URL·콜드메일 3줄·발송 대조).
// 같은 회사를 두 번 돌리면 run 이 새로 생긴다(비용 발생) — 먼저 발송 대조(ops/state/dm-log-*.md)로 중복을 거른다.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRun } from '../lib/consult/runs.ts'
import { collectAndStore } from '../lib/consult/pipeline.ts'
import { composeReport } from '../lib/consult/report/compose.ts'
import { coldMailLines, alreadySent } from '../lib/consult/report/mail.ts'
import { capExceeded } from '../lib/consult/usage.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const company = arg('company'), url = arg('url'), liner = arg('liner'), out = arg('out')
if (!company || !liner || !out) { console.error('사용법: --company <이름> --url <공개 주소> --liner <한 줄 설명> --out <폴더> [--owner <email>] [--preset cold|paid|free] [--force]'); process.exit(64) }
const preset = arg('preset', 'cold')
const owner = arg('owner') ?? (process.env.AUTH_ALLOWED_EMAILS ?? '').split(',')[0]?.trim()
if (!owner) { console.error('--owner 또는 AUTH_ALLOWED_EMAILS 가 필요합니다'); process.exit(64) }
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://solutionarch.vercel.app'

// 발송 대조(중복 제외) — 이미 보낸 회사는 만들지 않는다(--force 로만 강행).
const logs = existsSync('ops/state') ? readdirSync('ops/state').filter((f) => /^dm-log.*\.md$/.test(f)) : []
const dup = alreadySent(logs.map((f) => readFileSync(join('ops/state', f), 'utf8')).join('\n'), company)
if (dup.sent && !process.argv.includes('--force')) { console.log(`⚠ 이미 발송 기록이 있는 회사 — 건너뜀: ${dup.rows.join(' / ')}`); process.exit(3) }
if (await capExceeded()) { console.error('비용 상한(일·월)에 도달해 만들지 않습니다'); process.exit(4) }

const run = await createRun(owner, { kind: 'company', name: company, url, oneLiner: liner, scenario: 'batch' })
await collectAndStore(run)
const { token, payload } = await composeReport(run, preset, owner)
const reportUrl = `${SITE}/r/${token}`

mkdirSync(out, { recursive: true })
const slug = company.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'report'
const res = await fetch(reportUrl)
if (!res.ok) { console.error(`공개 페이지 렌더 실패 ${res.status} — 배포가 /r 을 서빙하는지 확인`); process.exit(5) }
const htmlPath = join(out, `${slug}.html`)
writeFileSync(htmlPath, await res.text())

let pdf = null
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
if (chrome) {
  const p = join(out, `${slug}.pdf`)
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${p}`, reportUrl], { timeout: 60000 })
  if (existsSync(p)) pdf = p
  else console.error('PDF 생성 실패(HTML 은 남음):', r.status)
}

const mail = coldMailLines({ company, headline: payload.ch1.headline, reportUrl })
writeFileSync(join(out, `${slug}.json`), JSON.stringify({ company, run_id: run.id, token, reportUrl, chapters: payload.chapters, html: htmlPath, pdf, mail, sent_check: dup.sent ? dup.rows : '처음 보내는 회사', note: '발송은 남헌이 직접(09~18시 KST). 이 도구는 보내지 않는다.' }, null, 2))
console.log(`완료 ${company} → ${reportUrl}\n장 ${payload.chapters.join(',')} · html=${htmlPath} · pdf=${pdf ?? '없음'}`)
for (const l of mail) console.log(l)
