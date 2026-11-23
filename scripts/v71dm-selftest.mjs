#!/usr/bin/env node
// v71dm 셀프테스트 — 자동 승인 소스 허용 목록 · 개발자 대상 가드(A~D) · v2.6 후보 기준(추가 전용). 가짜 supabase·가짜 LLM 만(네트워크·DB 없음).
//   node scripts/v71dm-selftest.mjs
//
// 지키는 것: (a) AUTO_APPROVAL_SOURCES — 없음/빈 값 = 제한 없음, 값 = 그 소스만, 이상한 값 = 확인 불가(승인 0건, DB 안 읽음)
// (b) 가드 패턴 A~D 지어낸 양성·음성, 앱스토어·구글 플레이는 같은 글이어도 면제, 10k자 글에서 시간 상한
// (c) 대상 풀에서 'dev-audience'·'source-not-allowed' 로 빠지고 감사 창(AUDIT_WINDOW_EXCLUDE)에는 그대로 남는다
// (d) 승인 스크립트(실제·--gradual-dry)·단계 표본·풀 함수가 같은 가드·같은 변수를 쓴다 + 워크플로 변수 배선
// (e) v2.6 은 추가 전용 — v2.4 이하·t2d 해시 불변, relevance-judge.ts 운영 선택 무변경, 예시는 지어낸 것
// (f) v26-compare: 입력 검증·--dry 통계·가짜 호출로 뒤집힘 출력  (g) 변이 — 일부러 깨면 위 검사가 잡는다

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
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
  'A-search-first': 'First, search the help docs and this forum. Then describe what you see below in as much detail as possible.',
  'B-version-failure': 'Upgraded to 2.14.1 and now the import page throws an exception, stack trace attached below for reference.',
  'C-source-phrase': 'I went through the plugin source and the sync loop never clears its cache when the vault reloads.',
  'C-code-tokens': 'The culprit is in src/sync/worker.js where Cache::flush is skipped and resetState() never runs on reload.',
  'D-install-strong': 'This extension is not required for a normal production installation, you can leave it disabled safely.',
  'D-ops-signals': 'Edit the config file and add the cron job line, then restart the web server and it should pick it up.',
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
  'Check https://example.com/a/b/c and https://example.com/x/y/z and https://example.com/p/q/r for screenshots of the bug.',
]
const LONG = 'x'.repeat(80)

async function checks(G, D, V) {
  const fails = []
  let pass = 0
  const ok = (c, name) => { if (c) pass++; else fails.push(name) }

  // (a) 허용 목록 의미
  for (const v of [undefined, null, '', '   ']) { const p = G.parseSourceAllowlist(v); ok(p.ok && p.allow === null, `(a) ${JSON.stringify(v)} → 제한 없음`) }
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
  ok(D.devAudienceReason('Version 3.1 fails to load my notes and I am frustrated with the whole thing.', 'obsidian_forum') === null, '(b) B 약한 표현 하나뿐 → 안 걸림')
  ok(D.devAudienceReason('The stack trace is long but I gave up and moved to another tool instead.', 'obsidian_forum') === null, '(b) B 강한 표현도 버전 번호 없으면 안 걸림')
  for (const [i, t] of NEG.entries()) ok(D.devAudienceReason(t, 'suitecrm_community') === null, `(b) 음성 #${i + 1} 사용자 목소리는 안 걸림`)
  ok(D.devAudienceReason('Look at helper.ts and foo() here, that is the whole thing really and nothing else.', 'hackernews') === null, '(b) C 코드 토큰 2개(<3)는 안 걸림')
  ok(D.devAudienceReason('Open the config file to change the theme color, it is easy to find and well documented.', 'hackernews') === null, '(b) D 약한 신호 1개는 안 걸림')
  ok(D.devAudienceReason(null, 'hackernews') === null && D.devAudienceReason('', 'hackernews') === null, '(b) 글 없음 → null(내용 가드가 따로 막는다)')
  ok(D.CODE_TOKEN_MIN === 3 && D.OPS_SIGNAL_MIN === 2 && D.DEV_AUDIENCE_EXEMPT_SOURCES.size === 2, '(b) 문턱 상수 3·2·면제 2곳')
  // 10k자 적대적 글 — 역추적 폭주가 없어야 한다.
  const evil = ['my ' + 'a '.repeat(5000), '1.'.repeat(5000), 'a/'.repeat(5000), 'I went through the ' + 'x '.repeat(5000), 'x'.repeat(10000), 'Your software '.repeat(700), ('foo() ' + 'Bar::baz ').repeat(600), 'v1.2 '.repeat(2000) + 'fails to', ' \t'.repeat(5000)]
  const t0 = performance.now()
  for (const e of evil) for (const s of ['hackernews', 'mautic_forum']) D.devAudienceReason(e, s)
  const ms = performance.now() - t0
  ok(ms < 1500, `(b) 10k자 적대적 글 ${evil.length * 2}회 ${ms.toFixed(0)}ms (<1500ms)`)

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

  // (e) v2.6 — 순수 부분(모듈 V)
  const a = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const v24 = C.relevanceCriteriaV24(a), v26 = V.relevanceCriteriaV26(a)
  ok(V.RELEVANCE_V26_VERSION === 'v26-2026-11-23' && v26.includes(`## 판정 기준 v2.6 (기준 버전 ${V.RELEVANCE_V26_VERSION})`), '(e) v2.6 버전 태그')
  const back = v26.replace(`기준 버전 ${V.RELEVANCE_V26_VERSION}`, `기준 버전 ${C.RELEVANCE_V24_VERSION}`).replace('## 판정 기준 v2.6', '## 판정 기준 v2.4')
  ok(back === v24 + V.RELEVANCE_V26_BLOCK, '(e) 머리글만 되돌리면 v2.4 본문 + v2.6 블록뿐(추가 전용)')
  ok([v26.indexOf('(17)'), v26.indexOf('(21) 개발자·관리자'), v26.indexOf('(22) 지나가는 언급'), v26.indexOf('(23) 약한 정보도 정보다')].every((x, i, xs) => x > 0 && (i === 0 || x > xs[i - 1])), '(e) (21)~(23) 이 (17) 뒤에 순서대로')
  const B = V.RELEVANCE_V26_BLOCK
  ok(['버그 리포트', '소스 코드', '플러그인 제작자', '자가 설치·운영', 'info=false', 'info=true', '오류가 아니다', '앱스토어·구글 플레이'].every((s) => B.includes(s)), '(e) 블록에 세 규칙의 요소(개발자 대상 4종·지나가는 언급·약한 정보·후기 면제)')
  ok(!/https?:|[0-9a-f]{8}-[0-9a-f]{4}-|mautic|suitecrm|obsidian|hacker\s?news/i.test(B), '(e) 블록에 URL·uuid·실제 소스/제품 이름 없음(지어낸 예시만)')
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const P = { product_elevator_pitch: 'p', business_model: 'saas' }, R = [{ input_id: 'x', text: 't' }]
  const sys24 = buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system
  const sys26 = V.systemV26FromV24(sys24, a)
  ok(sys26.includes('아래 판정 기준 v2.6 로') && !sys26.includes('판정 기준 v2.4') && sys26.replace(v26, v24).replace('아래 판정 기준 v2.6 로', '아래 판정 기준 v2.4 로') === sys24, '(e) v2.6 system = v2.4 system 에서 기준 블록·한 줄만 바뀜')
  let threw = false; try { V.systemV26FromV24(buildRelevancePrompt(P, R, [], { criteria: 'v22' }).system, a) } catch { threw = true }
  ok(threw, '(e) v2.4 프롬프트가 아니면 던진다(조용히 v2.4 로 판정하지 않음)')

  return { pass, fails }
}

let total = 0, fail = 0
const sh = (c, n) => { if (c) total++; else { fail++; console.error(`✗ ${n}`) } }
const G0 = await import('../lib/analysis/gradual-release.ts')
const D0 = await import('../lib/analysis/dev-audience-guard.ts')
const V0 = await import('../lib/analysis/relevance-criteria-v26.ts')
const r = await checks(G0, D0, V0)
total += r.pass; fail += r.fails.length
for (const f of r.fails) console.error(`✗ ${f}`)

// (d) 정적 배선 — 승인 스크립트·표본 스크립트·풀 함수·워크플로
{
  const ap = read('scripts/relevance-auto-approve.mjs')
  sh(ap.split('loadApprovalPool(sb, ').length === 3 && ap.includes('loadApprovalPool(sb, since, process.env.AUTO_APPROVAL_SOURCES)') && ap.includes('loadApprovalPool(sb, gate.since, process.env.AUTO_APPROVAL_SOURCES)'), '(d) 승인 스크립트: 드라이런·실제 두 곳 모두 같은 변수로 풀 함수')
  const ss = read('scripts/gradual-release-sample.mjs')
  sh(ss.includes('parseSourceAllowlist(process.env.AUTO_APPROVAL_SOURCES)') && ss.includes('applyApprovalGuard(sb, approved.map((r) => r.input_id), { allow: al.allow })') && /if \(!al\.ok\) \{[^\n]*process\.exit\(2\)/.test(ss) && ss.includes('guard.reasonOf.get(r.input_id)'), '(d) 표본 스크립트: 같은 변수·같은 가드 함수로 모집단을 거르고, 이상한 값이면 멈춘다')
  sh(ss.includes('이면 승인하지 않았을 글 ${ruleOutN}건 표본에서 제외'), '(d) 표본 머리글에 거른 수를 적는다(조용히 빼지 않음)')
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

// (e) v2.6 이 운영을 안 바꾼다 — 해시(analyze-relevance-selftest 와 같은 값, v25 추가 전 main 실측) + 운영 선택 로직에 v26 없음
{
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const S = await import('../lib/analysis/second-opinion.ts')
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const h = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16)
  const a = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']
  const P = { product_elevator_pitch: 'p', business_model: 'saas' }, R = [{ input_id: 'x', text: 't' }]
  const frozen = {
    t2d: h(C.RELEVANCE_CRITERIA), info: h(C.PRODUCT_INFORMATIVE_CRITERIA), ver: C.RELEVANCE_CRITERIA_VERSION,
    v21: h(C.RELEVANCE_CRITERIA_V21), v22: h(C.RELEVANCE_CRITERIA_V22), v23: h(C.relevanceCriteriaV23(a)), v24: h(C.relevanceCriteriaV24(a)),
    sys24: h(buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system), sec24: h(S.secondOpinionInstructionsV24(a)),
  }
  const want = { t2d: '03e8b059cd199d7f', info: 'c8d44049eb77d351', ver: 't2d-2026-09-28', v21: '4891de61b3afef7d', v22: 'a543abb21bc52814', v23: '198e8bec6b80b6d9', v24: '0b14c02f2ddfb851', sys24: 'c0600c2717900365', sec24: 'f2bd5d96769ab518' }
  sh(JSON.stringify(frozen) === JSON.stringify(want), `(e) v2.4 이하·t2d·운영 v24 system·2차 지시문 해시 불변 ${JSON.stringify(frozen) === JSON.stringify(want) ? '' : JSON.stringify(frozen)}`)
  const judge = read('lib/analysis/relevance-judge.ts'), crit = read('lib/analysis/relevance-criteria.ts')
  sh(!/v26|V26|relevance-criteria-v26/.test(judge + crit + read('lib/analysis/second-opinion.ts')), '(e) 운영 판정 파일(relevance-judge·criteria·second-opinion)에 v26 이 없다')
  const wfs = ['nightly-relevance.yml', 'relevance-approve-only.yml'].map((f) => read(`.github/workflows/${f}`)).join('\n')
  sh(!/v26/.test(wfs), '(e) 워크플로가 v26 을 켜지 않는다')
}

// (f) v26-compare
{
  const X = await import('./v26-compare.mjs')
  const a = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']
  const rows = [
    { input_id: 'k1', text: 'X 는 검색이 느려서 답답하다', project_purpose: '노트 앱 기획', source_key: 'obsidian_forum' },
    { key: 'k2', text: POS['A-version-header'], project: { pitch: 'p1', business_model: 'saas' }, source_key: 'mautic_forum', gold: { verdict: 'irrelevant', informative: false } },
    { key: 'k3', text: 'crash only', project: { pitch: 'p2', business_model: 'saas' }, source_key: 'hackernews' },
  ]
  const vr = X.validateRows(rows)
  sh(vr.errors.length === 0 && vr.rows.map((r) => r.key).join() === 'k1,k2,k3', '(f) 입력: input_id·project_purpose·gold 없음도 받는다(v25 입력 모양도)')
  sh(X.validateRows([rows[0], { ...rows[0] }]).errors.length === 1 && X.validateRows([{ key: 'z', text: 't' }]).errors.length === 1 && X.validateRows([{ ...rows[1], gold: { verdict: 'unknown', informative: 1 } }]).errors.length === 2 && X.validateRows([]).errors.length === 1 && X.validateRows({}).rows.length === 0, '(f) 중복 키·목적 없음·gold 형식 오류·빈 입력 거부')
  const st = X.promptStats(vr.rows, a)
  sh(st.v24.prompt_version === 'v24-2026-10-27' && st.v26.prompt_version === 'v26-2026-11-23' && st.v26.system_chars > st.v24.system_chars && st.v24.batches === 3, '(f) --dry 통계: 버전·system 길이·묶음 수(호출 없음)')
  const seen = []
  const call = async (system, user) => {
    seen.push(system)
    const on26 = system.includes('아래 판정 기준 v2.6 로')
    const labels = user.match(/^R\d+\./gm).map((l) => l.slice(0, -1))
    if (on26 && user.includes('crash only')) throw new Error('boom')
    return { model: 'fake', text: JSON.stringify(labels.map((id) => ({ id, rel: on26 && user.includes('My Acme') ? 'irrelevant' : 'relevant', info: !(on26 && user.includes('My Acme')), why: on26 ? 'v26' : 'v24' }))) }
  }
  const prev = process.env.LLM_PROVIDER
  process.env.LLM_PROVIDER = 'gemini'
  let res
  try { res = await X.runCompare(vr.rows, a, { call }) } finally { if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev }
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  sh(seen.length === 6 && seen.filter((s) => s.includes('아래 판정 기준 v2.6 로')).length === 3 && seen.filter((s) => s.includes('아래 판정 기준 v2.4 로')).length === 3, '(f) v24·v26 각 묶음 수만큼 호출, 기준이 맞게 실린다')
  sh(seen.slice(0, 3).every((s) => s === buildRelevancePrompt({ purpose: null, product_elevator_pitch: 'p1', business_model: 'saas' }, [{ input_id: 'k2', text: 'y' }], [], { criteria: 'v24', areas: a }).system), '(f) v24 쪽은 운영 v24 system 그대로')
  const k2 = res.rows.find((x) => x.key === 'k2')
  sh(res.flipped.join() === 'k2' && k2.v24.rel === 'relevant' && k2.v26.rel === 'irrelevant' && k2.dev_audience === 'A-version-header', `(f) 뒤집힘 = k2 만(가드 패턴 함께) ${JSON.stringify(res.flipped)}`)
  sh(res.rows.find((x) => x.key === 'k3').v26.rel === null && !res.flipped.includes('k3') && res.summary.v26.judged_with_gold === 1, '(f) 호출 오류는 rel=null — 뒤집힘으로 세지 않는다')
  const cs = read('scripts/v26-compare.mjs')
  sh(!/supabase|SERVICE_ROLE/i.test(cs.replace(/^\/\/.*$/gm, '')) && cs.includes("if (!run) {") && cs.includes("{ criteria: 'v24', areas }"), '(f) DB·서비스 키 없음 · --run 이 있어야만 부른다 · 운영 v24 경로로 부른다')
}

// (g) 변이 — 세 모듈을 임시 폴더에 복사해 한 곳만 바꾼다(다른 import 는 진짜 lib 로).
const LIB = join(ROOT, 'lib/analysis')
const libUrl = pathToFileURL(LIB + '/').href
const FILES = { G: 'gradual-release.ts', D: 'dev-audience-guard.ts', V: 'relevance-criteria-v26.ts' }
const KEEP = new Set(Object.values(FILES))
const orig = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(LIB, f), 'utf8')]))
const base = mkdtempSync(join(tmpdir(), 'v71dm-mut-'))
const mutants = [
  ['D', '면제 소스 비움', "new Set(['appstore', 'googleplay'])", 'new Set([])'],
  ['D', 'A 양식 머리글 패턴 빠짐', "['A-version-header', /", "['A-version-header-off', /"],
  ['D', 'B 약한 표현 하나로 충분', ".length >= 2) return 'B-version-failure'", ".length >= 1) return 'B-version-failure'"],
  ['D', 'B 버전 번호 조건 없음', 'if (VERSION_TOKEN.test(text)) {', 'if (true) {'],
  ['D', 'C 코드 토큰 문턱 3→1', 'export const CODE_TOKEN_MIN = 3', 'export const CODE_TOKEN_MIN = 1'],
  ['D', 'D 약한 신호 문턱 2→1', 'export const OPS_SIGNAL_MIN = 2', 'export const OPS_SIGNAL_MIN = 1'],
  ['D', 'URL 경로를 코드 토큰으로 셈', "text.replace(URL, ' ')", 'text'],
  ['D', '줄 전체 아닌 "your software" 도 머리글', '/^[ \\t]*your software[ \\t]*:?[ \\t]*$/im', '/your software/i'],
  ['G', '허용 목록 무시', 'else if (allow !== null && !allow.has(String(x.source_key)))', 'else if (false)'],
  ['G', '이상한 값 = 제한 없음', 'if (bad.length) return', 'if (false) return'],
  ['G', '빈 값 = 전부 막음', "if (!v.trim()) return { ok: true, allow: null }", "if (!v.trim()) return { ok: true, allow: new Set<string>() }"],
  ['G', '개발자 가드 미배선', 'const dev = devAudienceReason(x.raw_text, x.source_key)', 'const dev = null'],
  ['G', '감사 창이 개발자 대상도 뺀다', "['out-area', 'consumer-tag', 'github_issues', 'short']", "['out-area', 'consumer-tag', 'github_issues', 'short', 'dev-audience']"],
  ['G', '풀이 허용 목록을 안 넘김', '{ allow: al.allow })', '{})'],
  ['G', '이상한 값에도 DB 읽음', "if (!al.ok) return { ok: false, error: `${al.error} — 승인하지 않는다` }", ''],
  ['V', '규칙 (23) 빠짐', "  '(23) 약한 정보도 정보다", "  '(23x) 빠짐"],
  ['V', 'v2.4 아닌 프롬프트도 받음', "if (out.includes('판정 기준 v2.4') || !out.includes('(23) 약한 정보도 정보다') || !out.includes('아래 판정 기준 v2.6 로')) throw", 'if (false) throw'],
  ['V', '실제 소스 이름 예시 섞임', '지어낸 예: "회의 끝나고', '지어낸 예: "mautic 회의 끝나고'],
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
    m = await checks(...await Promise.all(['G', 'D', 'V'].map((k) => import(pathToFileURL(join(dir, FILES[k])).href))))
  } catch (e) { m = { fails: [`예외 ${e.message}`] } }
  mut.push({ 변이: `${FILES[file]} · ${name}`, 잡힌검사: m.fails.length, 예: (m.fails[0] ?? '').slice(0, 60) })
  sh(m.fails.length > 0, `(g) 변이 "${name}" 를 검사가 잡는다(${m.fails.length}건 실패)`)
}
console.table(mut)

console.log(`v71dm selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
