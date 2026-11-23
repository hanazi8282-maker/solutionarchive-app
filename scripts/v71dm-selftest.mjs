#!/usr/bin/env node
// v71dm 셀프테스트 — 자동 승인 소스 허용 목록 · 개발자 대상 가드(A~D) · 단계 표본 모집단. 가짜 supabase·가짜 LLM 만(네트워크·DB 없음).
//   node scripts/v71dm-selftest.mjs
//
// 지키는 것: (a) AUTO_APPROVAL_SOURCES — 없음/빈 값 = 제한 없음, 값 = 그 소스만, 이상한 값 = 확인 불가(승인 0건, DB 안 읽음)
// (b) 가드 패턴 A~D 지어낸 양성·음성, 앱스토어·구글 플레이는 같은 글이어도 면제, 10k자 글에서 시간 상한
// (c) 대상 풀에서 'dev-audience'·'source-not-allowed' 로 빠지고 감사 창(AUDIT_WINDOW_EXCLUDE)에는 그대로 남는다
// (d) 승인 스크립트(실제·--gradual-dry)·단계 표본·풀 함수가 같은 가드·같은 변수를 쓴다 + 워크플로 변수 배선
// (g) 변이 — 일부러 깨면 위 검사가 잡는다

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

// 가짜 supabase(gradual-release-selftest 와 같은 모양). calls 로 from() 호출 수를 센다.
function fake(tables, fail = []) {
  const sb = {
    calls: 0,
    from(table) {
      sb.calls++
      const preds = []
      let lo = 0, hi = Infinity
      const q = {
        select: () => q,
        eq: (c, v) => (preds.push((r) => r[c] === v), q),
        is: (c, v) => (preds.push((r) => (r[c] ?? null) === v), q),
        not: (c, op, v) => (preds.push((r) => (r[c] ?? null) !== v), q),
        gte: (c, v) => (preds.push((r) => r[c] != null && r[c] >= v), q),
        lt: (c, v) => (preds.push((r) => r[c] != null && r[c] < v), q),
        like: (c, pat) => (preds.push((r) => String(r[c]).startsWith(pat.replace(/%$/, ''))), q),
        in: (c, vals) => (preds.push((r) => vals.includes(r[c])), q),
        order: () => q,
        range: (a, b) => ((lo = a), (hi = b), q),
        update: () => { throw new Error('셀프테스트에서 update 호출 — 쓰기 금지') },
        then(res, rej) {
          const out = fail.includes(table)
            ? { data: null, error: { code: 'X', message: `${table} boom` } }
            : { data: (tables[table] ?? []).filter((r) => preds.every((p) => p(r))).slice(lo, hi + 1), error: null }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return q
    },
  }
  return sb
}

// ── 지어낸 글(실제 수집 글 아님) ──
const POS = {
  'A-version-header': 'Your software\nMy Acme version is: 4.1.0\nMy PHP version is: 8.2\nDescribe the problem: the scheduler does nothing at all.',
  'A-header-line': 'Your software\nWhat happens: nothing loads when I open the dashboard page.\nSteps: click save.',
  // v71dp: 머리글만으로는 안 걸린다 — 버전 표지 + 고장 표현이 같이 있어야(지어낸 글)
  'A-search-first': 'First, search the help docs and this forum. On v3.2 the export button is broken and nothing happens.',
  'B-version-failure': 'Upgraded to 2.14.1 and now the import page throws an exception, stack trace attached below for reference.',
  'C-source-phrase': 'I went through the plugin source and the sync loop never clears its cache when the vault reloads.',
  'C-code-tokens': 'The culprit is in src/sync/worker.js where Cache::flush is skipped and resetState() never runs on reload.',
  'D-install-strong': 'This extension is not required for a normal production installation, you can leave it disabled safely.',
  'D-ops-signals': 'Edit the config file, add the cron job line, then chmod the uploads folder and restart so it picks it up.',
}
const POS_B_WEAK = 'After upgrading to 5.3 the mail queue fails to send anything, it worked fine before 5.2 without issues.'
const NEG = [
  'I switched to this app because the free plan covers everything I need and the search is really fast.',
  'Price went from 4.99 to 9.99 a month after the update, which made me cancel my subscription and move on.',
  'It fails to sync sometimes, rated it 4.5 stars anyway because support is great and very responsive.',
  'Your software is great but the pricing page is confusing for small teams like ours, honestly.',
  'My version is the old one and I still like it more than the redesign, the sidebar was easier to use.',
  'I read the docs and the onboarding was smooth, much better than the tool we used before this one.',
  'We use npm and docker at work, the app integrates fine with our workflow and saves us a lot of time.',
  'Since 2.0 the app feels slower than the competitor we tried, so we are thinking about leaving it soon.',
  'Check https://example.com/a/b/index.php and https://example.com/x/main.js and https://example.com/y/app.py for screenshots.',
  'My favorite version is the old one, the redesign hid the sidebar and I use it less now than before.',
  'Plans went from 4.99 to 9.99 and the export fails to finish, a real regression for us small teams.',
  'Since 23.11.2026 the sync fails to start after updating, so we are moving our notes elsewhere soon.',
  'Version 2.1 is a regression, I moved to another app because search got slower and that is all.',
  'We met on 11/23/2026, 12/01/2026 and 01/15/2027 to compare tools, X won on price for our team.',
  'Open the config file and set up a cron job for reminders, otherwise the app works great for us.',
]
const POS_EXTRA = [
  ['A-version-header', 'Describe the problem: nothing happens on save.\nMy Acme version is: 4.1'],
  ['A-version-header', 'My Acme version is 4.1\nMy PHP version is 8.2\nThe scheduler does nothing when the queue is full.'],
  ['B-version-failure', 'v2.3 crashes with a traceback every time I open the settings page, please take a look.'],
  ['B-version-failure', 'After upgrading to 5.3.1 the queue is not working after the update, it fails to send.'],
]
const LONG = 'x'.repeat(80)

async function checks(G, D) {
  const fails = []
  let pass = 0
  const ok = (c, name) => { if (c) pass++; else fails.push(name) }

  // (a) 허용 목록 의미
  for (const v of [undefined, null, '']) { const p = G.parseSourceAllowlist(v); ok(p.ok && p.allow === null, `(a) ${JSON.stringify(v)} → 제한 없음`) }
  for (const v of ['   ', '\n', ' \n\t', '\r\n']) ok(!G.parseSourceAllowlist(v).ok, `(a) 공백·줄바꿈만 ${JSON.stringify(v)} → 확인 불가(승인 0건)`)
  const p1 = G.parseSourceAllowlist(' appstore , googleplay ')
  ok(p1.ok && p1.allow && p1.allow.size === 2 && p1.allow.has('appstore') && p1.allow.has('googleplay'), '(a) 쉼표 목록 → 그 소스만(앞뒤 공백 무시)')
  ok(G.parseSourceAllowlist('suitecrm_community').ok && G.parseSourceAllowlist('kakao-blog').ok, '(a) 밑줄·하이픈 키 허용')
  for (const v of ['appstore,,googleplay', 'appstore,', 'AppStore', 'app store', 'appstore;googleplay', '*', 'all', 123, ['appstore'], {}, true]) {
    const p = G.parseSourceAllowlist(v)
    ok(v === 'all' ? p.ok && p.allow.has('all') && p.allow.size === 1 : !p.ok, `(a) 이상한 값 ${JSON.stringify(v)} → ${v === 'all' ? "'all' 은 키 하나(전체 허용 아님)" : '확인 불가'}`)
  }

  // (b) 가드 패턴
  for (const [id, text] of Object.entries(POS)) {
    ok(D.devAudienceReason(text, 'mautic_forum') === id, `(b) ${id} 양성(지어낸 글)`)
    for (const s of ['appstore', 'googleplay']) ok(D.devAudienceReason(text, s) === null, `(b) ${id} 같은 글이라도 ${s} 는 면제`)
    ok(D.devAudienceReason(text, 'hackernews') === id && D.devAudienceReason(text, null) === id, `(b) ${id} hackernews·소스 미상에도 적용`)
  }
  ok(D.devAudienceReason(POS_B_WEAK, 'obsidian_forum') === 'B-version-failure', '(b) B 버전 + 약한 고장 표현 둘 → 걸림')
  for (const [id, t] of POS_EXTRA) ok(D.devAudienceReason(t, 'mautic_forum') === id && D.devAudienceReason(t, 'appstore') === null, `(b) ${id} 추가 양성: ${t.slice(0, 30)}`)
  ok(D.MAX_SCAN_CHARS === 8000 && D.devAudienceReason('y '.repeat(4000) + POS['D-install-strong'], 'hackernews') === null && D.devAudienceReason('y '.repeat(3000) + POS['D-install-strong'], 'hackernews') === 'D-install-strong', '(b) 앞 8,000자만 본다(그 뒤 표지는 안 봄)')
  ok(D.devAudienceReason('Version 3.1 fails to load my notes and I am frustrated with the whole thing.', 'obsidian_forum') === null, '(b) B 약한 표현 하나뿐 → 안 걸림')
  ok(D.devAudienceReason('The stack trace is long but I gave up and moved to another tool instead.', 'obsidian_forum') === null, '(b) B 강한 표현도 버전 번호 없으면 안 걸림')
  for (const [i, t] of NEG.entries()) ok(D.devAudienceReason(t, 'suitecrm_community') === null, `(b) 음성 #${i + 1} 사용자 목소리는 안 걸림`)
  ok(D.devAudienceReason('Look at helper.ts and foo() here, that is the whole thing really and nothing else.', 'hackernews') === null, '(b) C 코드 토큰 2개(<3)는 안 걸림')
  ok(D.devAudienceReason('Open the config file to change the theme color, it is easy to find and well documented.', 'hackernews') === null, '(b) D 약한 신호 1개는 안 걸림')
  ok(D.devAudienceReason('Open the config file, add a cron job for reminders and chmod the folder.', 'hackernews') === 'D-ops-signals', '(b) D 약한 신호 3개 → 걸림')
  // v71dp — A-search-first 는 머리글 ∧ 버전 표지 ∧ 고장 표현일 때만(지어낸 글)
  const SF = 'First, search the help docs and this forum. '
  ok(D.devAudienceReason(SF + 'I love how calm the writing view feels, it helps me focus every morning.', 'obsidian_forum') === null, '(b) A-search-first 머리글만 → 안 걸림')
  ok(D.devAudienceReason(SF + 'Since I moved here the export is broken and I cannot share notes anymore.', 'obsidian_forum') === null, '(b) A-search-first 머리글 + 고장 표현만(버전 없음) → 안 걸림')
  ok(D.devAudienceReason(SF + 'I updated to 1.4 last week and the new theme looks lovely on my tablet.', 'obsidian_forum') === null, '(b) A-search-first 머리글 + 버전만(고장 없음) → 안 걸림')
  ok(D.devAudienceReason(SF + 'Running 2.5.1 the sync fails to start on my phone.', 'obsidian_forum') === 'A-search-first', '(b) A-search-first 머리글 + 세 마디 버전 + fails to → 걸림')
  ok(D.devAudienceReason(SF + 'After the update to v1.9 I cannot open the vault.', 'obsidian_forum') === 'A-search-first' && D.devAudienceReason(SF + 'After the update to v1.9 I cannot open the vault.', 'appstore') === null, '(b) A-search-first 버전+cannot → 걸림, 앱스토어 면제')
  ok(D.devAudienceReason(SF + 'Version 4.0 shows the wrongful date in the calendar header.', 'obsidian_forum') === null, '(b) A 고장 표현은 단어 경계(wrongful ≠ wrong)')
  ok(D.devAudienceReason('On v3.2 the export button is broken and nothing happens.', 'obsidian_forum') === null && D.devAudienceReason(POS_B_WEAK, 'obsidian_forum') === 'B-version-failure', '(b) 머리글 없이 버전+고장 하나 → A 아님(B 규칙 그대로: 약한 하나는 안 걸리고 둘이면 B)')
  ok(D.devAudienceReason(null, 'hackernews') === null &&D.devAudienceReason('', 'hackernews') === null, '(b) 글 없음 → null(내용 가드가 따로 막는다)')
  ok(D.CODE_TOKEN_MIN === 3 && D.OPS_SIGNAL_MIN === 3 && D.DEV_AUDIENCE_EXEMPT_SOURCES.size === 2, '(b) 문턱 상수 3·3·면제 2곳')
  // 10k자 적대적 글 — 역추적 폭주가 없어야 한다.
  const evil = ['my ' + 'a '.repeat(5000), '1.'.repeat(5000), 'a/'.repeat(5000), 'I went through the ' + 'x '.repeat(5000), 'x'.repeat(10000), 'Your software '.repeat(700), ('foo() ' + 'Bar::baz ').repeat(600), 'v1.2 '.repeat(2000) + 'fails to', ' \t'.repeat(5000), 'a-'.repeat(10000), 'a.'.repeat(10000), '-a'.repeat(10000), '1/'.repeat(10000), 'a_b.'.repeat(5000), 'ab/'.repeat(7000) + '!', 'A::'.repeat(7000), 'version '.repeat(2500), 'my x '.repeat(4000)]
  const t0 = performance.now()
  for (const e of evil) for (const s of ['hackernews', 'mautic_forum']) D.devAudienceReason(e, s)
  const ms = performance.now() - t0
  ok(ms < 1500, `(b) 10k~20k자 적대적 글 ${evil.length * 2}회 ${ms.toFixed(0)}ms (<1500ms)`)

  // (b2) 단계 표본 모집단 — 이미 승인된 글은 가드 사유가 있어도 빼지 않는다(원문 없음만 뺀다).
  const appr = ['s1', 's2', 's3', 's4', 's5', 's6'].map((input_id) => ({ input_id }))
  const tx = new Map([['s1', { source_key: 'mautic_forum', raw_text: POS['A-version-header'] }], ['s2', { source_key: 'hackernews', raw_text: LONG }], ['s3', { source_key: 'reddit', raw_text: LONG }], ['s4', { source_key: 'reddit', raw_text: 'short' }], ['s5', { source_key: 'appstore', raw_text: LONG }], ['s6', { source_key: 'reddit', raw_text: '  ' }]])
  const why = new Map([['s1', 'dev-audience'], ['s2', 'source-not-allowed'], ['s3', 'out-area'], ['s4', 'short']])
  const sp = G.stagePopulation(appr, tx, why)
  ok(sp.pool.map((r) => r.input_id).join() === 's1,s2,s3,s4,s5' && sp.dropped === 1, `(b2) 표본 모집단: 개발자 대상·허용 목록 밖·영역 밖·짧은 글도 그대로, 원문 없음만 빠짐 ${sp.pool.map((r) => r.input_id).join()}`)
  ok(sp.ruleOut['dev-audience'] === 1 && sp.ruleOut['source-not-allowed'] === 1 && sp.ruleOut['out-area'] === 1 && sp.ruleOut.short === 1, '(b2) 가드 사유는 집계로만 남는다')

  // (c) 대상 풀 경로
  const v = (id, o = {}) => ({ input_id: id, verdict: 'relevant', second_verdict: 'relevant', product_informative: true, second_product_informative: true, human_verdict: null, judged_at: '2026-12-05T00:00:00Z', auto_approved_at: null, ...o })
  const inputs = [
    ['as1', 'appstore', LONG], ['as2', 'appstore', POS['A-version-header']], ['gp1', 'googleplay', POS['C-code-tokens']],
    ['hn1', 'hackernews', LONG], ['hn2', 'hackernews', POS['B-version-failure']], ['fo1', 'mautic_forum', POS['A-version-header']],
    ['fo2', 'obsidian_forum', NEG[0]], ['gh', 'github_issues', LONG], ['sh', 'reddit', 'x'.repeat(59)],
  ]
  const tables = {
    review_relevance_verdicts: inputs.map(([id]) => v(id)),
    analysis_inputs: inputs.map(([id, src, raw_text]) => ({ id, project_id: 'p1', source_key: src, raw_text })),
    analysis_projects: [{ id: 'p1', area_code: '5' }], consumer_material_tags: [],
  }
  const since = new Date('2026-12-01T00:00:00+09:00')
  const ids = (pool) => (pool.ok ? pool.targets.map((r) => r.input_id).sort().join() : `ERR ${pool.error}`)
  const open = await G.loadApprovalPool(fake(tables), since, undefined)
  ok(ids(open) === 'as1,as2,fo2,gp1,hn1', `(c) 허용 목록 없음 → 가드만(앱스토어·구글은 패턴이 있어도 통과) ${ids(open)}`)
  ok(open.ok && open.guardDrop['dev-audience'] === 2 && open.devAudience['A-version-header'] === 1 && open.devAudience['B-version-failure'] === 1 && open.guardDrop['source-not-allowed'] === 0, `(c) 개발자 대상 2건·패턴별 집계 ${open.ok ? JSON.stringify(open.devAudience) : ''}`)
  ok(open.ok && open.guardDrop.github_issues === 1 && open.guardDrop.short === 1 && open.allow === null, '(c) 기존 내용 가드 집계 그대로')
  ok(ids(await G.loadApprovalPool(fake(tables), since, '')) === ids(open) && ids(await G.loadApprovalPool(fake(tables), since)) === ids(open), "(c) '' · 인자 없음 = 제한 없음(오늘 동작)")
  const only = await G.loadApprovalPool(fake(tables), since, 'appstore,googleplay')
  ok(ids(only) === 'as1,as2,gp1' && only.guardDrop['source-not-allowed'] === 4 && only.guardDrop['dev-audience'] === 0, `(c) 허용 목록 appstore,googleplay → 그 소스만 ${ids(only)} ${only.ok ? JSON.stringify(only.guardDrop) : ''}`)
  ok(ids(await G.loadApprovalPool(fake(tables), since, 'obsidian_forum')) === 'fo2', '(c) 허용 목록 소스 하나')
  ok(ids(await G.loadApprovalPool(fake(tables), since, 'nonexistent_src')) === '', '(c) 없는 소스 키 → 0건(제한 없음으로 접지 않음)')
  for (const bad of ['appstore,,', 'AppStore', 'app store']) {
    const sb = fake(tables)
    const r = await G.loadApprovalPool(sb, since, bad)
    ok(!r.ok && sb.calls === 0, `(c) 이상한 값 ${JSON.stringify(bad)} → ok:false·DB 안 읽음(승인 0건)`)
  }
  // 감사 창: dev-audience 행은 빼지 않는다(킬스위치를 느슨하게 하지 않는다).
  ok([...G.AUDIT_WINDOW_EXCLUDE].sort().join() === 'consumer-tag,github_issues,out-area,short', '(c) AUDIT_WINDOW_EXCLUDE 그대로 4개')
  const aud = {
    review_relevance_verdicts: inputs.map(([id]) => ({ input_id: id, auto_approval_rule: 'rr-v2', auto_approved_at: '2026-12-02T00:00:00.000Z', human_verdict: 'irrelevant', human_product_informative: true, human_graded_at: '2026-12-03T00:00:00.000Z' })),
    analysis_inputs: tables.analysis_inputs, analysis_projects: tables.analysis_projects, consumer_material_tags: [],
  }
  const w = await G.loadGuardedAuditWindow(fake(aud))
  ok(w.ok && w.audits.length === 7 && w.audits.some((a) => a.input_id === 'hn2') && w.audits.some((a) => a.input_id === 'fo1') && !w.excluded['dev-audience'], `(c) 감사 창은 개발자 대상 오류를 그대로 센다(github·짧은 글만 빠짐) ${w.ok ? w.audits.length : w.error}`)

  // (d) 같은 경로 — 풀 결과 = 같은 허용 목록으로 부른 applyApprovalGuard 의 무사유 id(표본 스크립트가 부르는 바로 그 함수)
  for (const raw of [undefined, 'appstore,googleplay', 'hackernews']) {
    const al = G.parseSourceAllowlist(raw)
    const pool = await G.loadApprovalPool(fake(tables), since, raw)
    const g = await G.applyApprovalGuard(fake(tables), inputs.map(([id]) => id), { allow: al.allow })
    const viaGuard = inputs.map(([id]) => id).filter((id) => !g.reasonOf.has(id)).sort().join()
    ok(pool.ok && g.ok && ids(pool) === viaGuard, `(d) 풀(승인·드라이런)과 가드(표본)가 같은 id 를 낸다 — ${JSON.stringify(raw ?? null)}`)
  }

  return { pass, fails }
}

let total = 0, fail = 0
const sh = (c, n) => { if (c) total++; else { fail++; console.error(`✗ ${n}`) } }
const G0 = await import('../lib/analysis/gradual-release.ts')
const D0 = await import('../lib/analysis/dev-audience-guard.ts')
const r = await checks(G0, D0)
total += r.pass; fail += r.fails.length
for (const f of r.fails) console.error(`✗ ${f}`)

// (d) 정적 배선 — 승인 스크립트·표본 스크립트·풀 함수·워크플로
{
  const ap = read('scripts/relevance-auto-approve.mjs')
  sh(ap.split('loadApprovalPool(sb, ').length === 3 && ap.includes('loadApprovalPool(sb, since, process.env.AUTO_APPROVAL_SOURCES)') && ap.includes('loadApprovalPool(sb, gate.since, process.env.AUTO_APPROVAL_SOURCES)'), '(d) 승인 스크립트: 드라이런·실제 두 곳 모두 같은 변수로 풀 함수')
  const ss = read('scripts/gradual-release-sample.mjs')
  sh(ss.includes('parseSourceAllowlist(process.env.AUTO_APPROVAL_SOURCES)') && ss.includes('applyApprovalGuard(sb, approved.map((r) => r.input_id), { allow: al.allow })') && ss.includes('stagePopulation(approved, textById, guard.ok ? guard.reasonOf : new Map())') && !/reasonOf\.(get|has)\(/.test(ss) && !/process\.exit\(2\)[^\n]*al\.|al\.ok\)[^\n]*process\.exit/.test(ss), '(d) 표본 스크립트: 같은 변수·같은 가드 함수지만 집계만 — 모집단은 stagePopulation(원문 없음만 뺌), 가드 실패로 멈추지 않는다')
  sh(ss.includes('참고(집계만 — 표본에서 빼지 않았다)') && ss.includes('이면 승인하지 않았을 글 ${ruleOutN}건') && ss.includes('지금 승인 규칙 집계 확인 불가'), '(d) 표본 머리글: 가드 사유는 집계 한 줄(확인 불가도 적는다)')
  const g = read('lib/analysis/gradual-release.ts')
  const body = (name) => { const i = g.indexOf(`export async function ${name}(`); const k = g.indexOf('\nexport ', i + 1); return i < 0 ? '' : g.slice(i, k < 0 ? undefined : k) }
  sh(body('loadApprovalPool').includes('applyApprovalGuard(sb, agreed.map((r) => r.input_id), { allow: al.allow })') && body('loadGuardedAuditWindow').includes('applyApprovalGuard(sb, rows.map((r) => r.input_id))'), '(d) 풀은 허용 목록을 넘기고, 감사 창은 넘기지 않는다(감사 창 정의 불변)')
  const code = g.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  sh((code.match(/devAudienceReason\(/g) ?? []).length === 1 && body('applyApprovalGuard').includes('devAudienceReason(x.raw_text, x.source_key)'), '(d) 개발자 대상 가드는 applyApprovalGuard 한 곳에서만 부른다')
  const LINE = "AUTO_APPROVAL_SOURCES: ${{ vars.AUTO_APPROVAL_SOURCES || '' }}"
  const only = read('.github/workflows/relevance-approve-only.yml')
  sh(only.includes(LINE) && (only.match(/secrets\./g) ?? []).length === 3 && /permissions:\n  contents: read\n/.test(only), '(d) approve-only: 변수 배선 · 시크릿 3개 그대로 · 권한 contents:read 그대로')
  const nr = read('.github/workflows/nightly-relevance.yml')
  const step = nr.slice(nr.indexOf('- name: Auto-approve full-agreement'), nr.indexOf('- name:', nr.indexOf('- name: Auto-approve full-agreement') + 5))
  sh(step.includes(LINE) && step.includes('run: node scripts/relevance-auto-approve.mjs') && nr.split(LINE).length === 2, '(d) nightly-relevance: Auto-approve 스텝에만 변수 배선')
  sh(/^\s+- run: node scripts\/v71dm-selftest\.mjs\s*$/m.test(read('.github/workflows/build-check.yml')), '(d) build-check 에 이 셀프테스트가 등록돼 있다')
}

// (g) 변이 — 두 모듈을 임시 폴더에 복사해 한 곳만 바꾼다(다른 import 는 진짜 lib 로).
const LIB = join(ROOT, 'lib/analysis')
const libUrl = pathToFileURL(LIB + '/').href
const FILES = { G: 'gradual-release.ts', D: 'dev-audience-guard.ts' }
const KEEP = new Set(Object.values(FILES))
const orig = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(LIB, f), 'utf8')]))
const base = mkdtempSync(join(tmpdir(), 'v71dm-mut-'))
const mutants = [
  ['D', '면제 소스 비움', "new Set(['appstore', 'googleplay'])", 'new Set([])'],
  ['D', 'A 양식 머리글 패턴 빠짐', 'if (A_VERSION_COLON.test(text) ||', 'if (false ||'],
  ['D', 'B 약한 표현 하나로 충분', ".length >= 2) return 'B-version-failure'", ".length >= 1) return 'B-version-failure'"],
  ['D', 'B 버전 번호 조건 없음', 'if (VERSION_TOKEN.test(text)) {', 'if (true) {'],
  ['D', 'C 코드 토큰 문턱 3→1', 'export const CODE_TOKEN_MIN = 3', 'export const CODE_TOKEN_MIN = 1'],
  ['D', 'D 약한 신호 문턱 3→2', 'export const OPS_SIGNAL_MIN = 3', 'export const OPS_SIGNAL_MIN = 2'],
  ['D', 'A 콜론 없는 한 줄도 양식', '(text.match(A_VERSION_LINE) ?? []).length >= 2', '(text.match(A_VERSION_LINE) ?? []).length >= 1'],
  ['D', 'B 느슨한 버전(가격·날짜도 버전)', 'const VERSION_TOKEN = /', 'const VERSION_TOKEN = /\\d+\\.\\d+|'],
  ['D', 'regression 을 강한 표현으로', '[/\\bstack\\s?trace\\b/i, /\\btraceback\\b/i]', '[/\\bstack\\s?trace\\b/i, /\\btraceback\\b/i, /\\bregression\\b/i]'],
  ['D', '날짜를 경로 토큰으로 셈', 'if (!/[A-Za-z]/.test(m)) continue', ''],
  ['D', 'A-search-first 머리글만으로 걸림(v71dp 이전)', '(A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text) && A_FAILURE.test(text))', '(A_SEARCH_FIRST.test(text))'],
  ['D', 'A-search-first 버전 조건 빠짐', '(A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text) && A_FAILURE.test(text))', '(A_SEARCH_FIRST.test(text) && A_FAILURE.test(text))'],
  ['D', 'A-search-first 고장 조건 빠짐', '(A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text) && A_FAILURE.test(text))', '(A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text))'],
  ['D', 'A-search-first 규칙 없음', "if (A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text) && A_FAILURE.test(text)) return 'A-search-first'", ''],
  ['D', 'A 고장 표현 단어 경계 없음', "|unable\\s+to)(?![\\w'])/i", '|unable\\s+to)/i'],
  ['D', '8,000자 상한 없음', 'const text = raw.slice(0, MAX_SCAN_CHARS)', 'const text = raw'],
  ['G', '공백만 = 제한 없음', "if (v === '') return { ok: true, allow: null }", "if (!v.trim()) return { ok: true, allow: null }"],
  ['G', '표본이 가드로 거름', 'const pool = rows.filter((r) => r.text.trim().length > 0)', 'const pool = rows.filter((r) => r.text.trim().length > 0 && !reasonOf.has(r.input_id))'],
  ['D', 'URL 경로를 코드 토큰으로 셈', "text.replace(URL, ' ')", 'text'],
  ['D', '줄 전체 아닌 "your software" 도 머리글', '/^[ \\t]*your software[ \\t]*:?[ \\t]*$/im', '/your software/i'],
  ['G', '허용 목록 무시', 'else if (allow !== null && !allow.has(String(x.source_key)))', 'else if (false)'],
  ['G', '이상한 값 = 제한 없음', 'if (bad.length) return', 'if (false) return'],
  ['G', '빈 값 = 전부 막음', "if (v === '') return { ok: true, allow: null }", "if (v === '') return { ok: true, allow: new Set<string>() }"],
  ['G', '개발자 가드 미배선', 'const dev = devAudienceReason(x.raw_text, x.source_key)', 'const dev = null'],
  ['G', '감사 창이 개발자 대상도 뺀다', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'consumer-tag', 'github_issues', 'short', 'dev-audience']"],
  ['G', '풀이 허용 목록을 안 넘김', '{ allow: al.allow })', '{})'],
  ['G', '이상한 값에도 DB 읽음', "if (!al.ok) return { ok: false, error: `${al.error} — 승인하지 않는다` }", ''],
]
const mut = []
for (const [i, [file, name, from, to]] of mutants.entries()) {
  if (!orig[file].includes(from)) { fail++; console.error(`✗ (g) 변이 지점 없음: ${name}`); continue }
  const dir = join(base, `m${i}`)
  mkdirSync(dir)
  for (const [k, f] of Object.entries(FILES)) {
    const text = (k === file ? orig[k].replace(from, to) : orig[k]).replace(/from '\.\/([^']+)'/g, (m, dep) => (KEEP.has(dep) ? m : `from '${libUrl}${dep}'`))
    writeFileSync(join(dir, f), text)
  }
  let m
  try {
    m = await checks(...await Promise.all(['G', 'D'].map((k) => import(pathToFileURL(join(dir, FILES[k])).href))))
  } catch (e) { m = { fails: [`예외 ${e.message}`] } }
  mut.push({ 변이: `${FILES[file]} · ${name}`, 잡힌검사: m.fails.length, 예: (m.fails[0] ?? '').slice(0, 60) })
  sh(m.fails.length > 0, `(g) 변이 "${name}" 를 검사가 잡는다(${m.fails.length}건 실패)`)
}
console.table(mut)

console.log(`v71dm selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
