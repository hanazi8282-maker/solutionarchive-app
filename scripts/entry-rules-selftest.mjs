#!/usr/bin/env node
// v71dx 입구 규칙 셀프테스트 — 지어낸 글·가짜 supabase 만(네트워크·DB·LLM 없음). 사람 라벨 60행은 쓰지 않는다(그건 리플레이 몫).
//   node scripts/entry-rules-selftest.mjs
//
// 지키는 것: (a) 유형별 판정(지어낸 양성·음성) (b) 꺼짐 기본·그림자·적용 스위치 (c) 풀 경로 — 꺼짐이면 결과·DB 호출 수가 그대로,
//   그림자는 대상 불변·집계만, 적용은 부분집합(좁히기만), 조회 실패는 적용=확인 불가(ok:false)·그림자=기록만
// (d) 설정이 JSON 직렬화된다 (e) 긴 적대적 글 시간 상한 (f) 변이 — 일부러 깨면 위 검사가 잡는다

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

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
const T = {
  hnAnchored: 'I have been using Acmenote for two years because it syncs faster than the tool we used before, and the free plan covers my whole team.',
  hnPassing: 'Writing tools in general need better revision history. Organizers such as Acmenote are great but the real question is about editors and how people draft long documents.',
  hnAbsent: 'The thread is about compilers. Optimisers in general matter more than syntax, and I prefer languages with good error messages.',
  forumRequest: 'Use case or problem: when I manage many campaigns there is no column that shows the target list, so users have to open every item. Proposed solution: add a column.',
  forumLimit: "You can't do that from the list view, there is no option for it; the setting only works on the detail page.",
  forumSymptom: 'It keeps freezing when I save a big list, very frustrating.',
  forumDev: 'I want this upgrade-proof because core files get replaced. Put the widget as a frontend extension in the extensions/ folder, add logic hooks under custom/Extension, expose a webhook endpoint and call the REST API with an OAuth token; returns HTTP 500 with JSON.',
  forumInstall: 'You download it from the releases page. Then open the web interface, click on "Add device", enter the ID shown on the phone, go to settings and configure the folder.',
  forumPromo: "I developed a sync plugin for this because it syncs faster than the built-in option; I'm the author and open to suggestions for features.",
  ytShort: 'Holy crap, the free plan covers one user set, signing up now!',
  ytDev: 'Set up the webhook endpoint, call the REST API with OAuth, parse the JSON and patch the PHP callback, then configure the SMTP DSN on the backend.',
}

async function checks(E, G) {
  const fails = []
  let pass = 0
  const ok = (c, n) => { if (c) pass++; else fails.push(n) }
  const V = (t, s, p) => E.entryVerdict(t, s, p)

  // (a) 유형별 판정
  ok(V(T.hnAnchored, 'hackernews', 'Acmenote').pass, '(a) HN: 제품을 주어로 이유·가격과 함께 → 통과')
  ok(!V(T.hnPassing, 'hackernews', 'Acmenote').pass, '(a) HN: 예시로만 든 제품("such as") → 막음')
  ok(!V(T.hnAbsent, 'hackernews', 'Acmenote').pass, '(a) HN: 제품이 글에 없다 → 막음')
  ok(V(T.forumRequest, 'mautic_forum', 'Acme').pass && V(T.forumRequest, 'suitecrm_community').pass, '(a) 포럼: 사용 맥락 있는 기능 요청 → 통과')
  ok(V(T.forumLimit, 'obsidian_forum', 'Acme').pass, '(a) 포럼: 답변이지만 제품 한계 사실 → 통과')
  ok(V(T.forumSymptom, 'obsidian_forum').pass, '(a) 포럼: 이유 없는 한 줄 증상(weak) → 막지 않는다')
  ok(!V(T.forumDev, 'suitecrm_community').pass, '(a) 포럼: 개발자 대상(API·훅·웹훅) → 막음')
  ok(!V(T.forumInstall, 'obsidian_forum').pass, '(a) 포럼: 설치·설정 절차 → 막음')
  ok(!V(T.forumPromo, 'mautic_forum').pass, '(a) 포럼: 자기 플러그인 홍보 → 막음')
  ok(V('I created my target list and two suppression lists before sending.', 'mautic_forum').reasons.every((r) => !r.startsWith('promo')), '(a) "I created my list" 는 홍보가 아니다(도구 명사가 있어야)')
  ok(V(T.ytShort, 'youtube', 'search-discovery marketing_automation').pass, '(a) YouTube: 짧은 사용자 반응 → 통과(발굴 프로젝트 이름은 제품명 아님)')
  ok(!V(T.ytDev, 'youtube').pass, '(a) YouTube 도 개발자 글은 막는다')
  ok(!V(T.hnAnchored, 'github_issues', 'Acmenote').pass, '(a) github_issues 는 언제나 막음')
  const as = V(T.forumDev, 'appstore')
  ok(as.pass && as.score === null && as.reasons[0] === 'source-not-covered' && V(T.forumDev, 'googleplay').pass && V(T.forumDev, 'reddit').pass, '(a) 표에 없는 소스(앱스토어·구글 플레이 등)는 적용 안 함')
  ok(!V('', 'hackernews').pass && !V(null, 'youtube').pass && !V('   ', 'obsidian_forum').pass, '(a) 글 없음 → 막음(통과로 접지 않음)')
  ok(V(T.hnAnchored, 'hackernews', 'Acmenote').version === E.ENTRY_RULES_VERSION && typeof V(T.forumDev, 'suitecrm_community').score === 'number', '(a) 판정에 규칙 버전·점수')
  ok(V('[HN: Acmenote is great · ▲10] ' + T.hnAbsent, 'hackernews', 'Acmenote').pass === false, '(a) 머리 꼬리표(스레드 제목)의 제품명은 언급으로 세지 않는다')
  ok(E.productLike('Workday HCM') && !E.productLike('search-discovery marketing_automation') && E.productNameFromUrl('https://www.acmenote.com/pricing') === 'acmenote' && E.productNameFromUrl('https://apps.apple.com/app/x') === null && E.productNameFromUrl('nope') === null, '(a) 제품명 도우미')

  // (b) 스위치
  ok(E.entryRulesMode({}) === 'off' && E.entryRulesMode(null) === 'off' && E.entryRulesMode({ ENTRY_RULES_ENABLED: 'yes' }) === 'off' && E.entryRulesMode({ ENTRY_RULES_SHADOW: 'true' }) === 'off', '(b) 기본 꺼짐 — ENABLED=true 가 아니면 SHADOW 도 무효')
  ok(E.entryRulesMode({ ENTRY_RULES_ENABLED: 'true' }) === 'enforce' && E.entryRulesMode({ ENTRY_RULES_ENABLED: ' TRUE ', ENTRY_RULES_SHADOW: 'true' }) === 'shadow', '(b) 켜짐 = 적용, +SHADOW = 그림자')

  // (c) 풀 경로
  const v = (id) => ({ input_id: id, verdict: 'relevant', second_verdict: 'relevant', product_informative: true, second_product_informative: true, human_verdict: null, judged_at: '2026-12-05T00:00:00Z', auto_approved_at: null })
  const inputs = [
    ['a1', 'appstore', 'p1', T.forumDev], ['h1', 'hackernews', 'p2', T.hnAnchored], ['h2', 'hackernews', 'p2', T.hnPassing],
    ['f1', 'mautic_forum', 'p1', T.forumRequest], ['f2', 'mautic_forum', 'p1', T.forumPromo], ['o1', 'obsidian_forum', 'p1', T.forumInstall], ['y1', 'youtube', 'p1', T.ytShort],
  ]
  const tables = {
    review_relevance_verdicts: inputs.map(([id]) => v(id)),
    analysis_inputs: inputs.map(([id, source_key, project_id, raw_text]) => ({ id, project_id, source_key, raw_text })),
    analysis_projects: [{ id: 'p1', area_code: '5', competitor_url: 'https://forum.example.org' }, { id: 'p2', area_code: '5', competitor_url: 'https://www.acmenote.com/' }],
    consumer_material_tags: [],
  }
  const since = new Date('2026-12-01T00:00:00+09:00')
  const ids = (p) => (p.ok ? p.targets.map((r) => r.input_id).sort().join() : `ERR ${p.error}`)
  const sbDef = fake(tables), sbOff = fake(tables)
  const def = await G.loadApprovalPool(sbDef, since, undefined)
  const off = await G.loadApprovalPool(sbOff, since, undefined, 'off')
  ok(def.ok && JSON.stringify(def, (k, x) => (x instanceof Set ? [...x] : x)) === JSON.stringify(off, (k, x) => (x instanceof Set ? [...x] : x)) && !('entryRule' in def) && sbDef.calls === sbOff.calls, `(c) 꺼짐(기본 env) = 명시 'off' — 결과 같고 entryRule 없음·DB 호출 수 같음(${sbDef.calls})`)
  ok(ids(off) === 'a1,f1,f2,h1,h2,o1,y1', `(c) 꺼짐이면 입구 규칙이 아무것도 빼지 않는다 ${ids(off)}`)
  const sbSh = fake(tables)
  const sh = await G.loadApprovalPool(sbSh, since, undefined, 'shadow')
  ok(sh.ok && ids(sh) === ids(off) && sh.entryRule?.mode === 'shadow' && sh.entryRule.checked === 7 && sh.entryRule.blocked === 3, `(c) 그림자: 대상 불변, 판정만 집계 ${sh.ok ? JSON.stringify(sh.entryRule) : sh.error}`)
  const en = await G.loadApprovalPool(fake(tables), since, undefined, 'enforce')
  ok(ids(en) === 'a1,f1,h1,y1' && en.entryRule?.blocked === 3 && en.entryRule.blockedBySource.hackernews === 1, `(c) 적용: 막힌 글만 빠진다(앱스토어는 미적용) ${ids(en)}`)
  ok(en.ok && off.ok && en.targets.every((r) => off.targets.some((x) => x.input_id === r.input_id)), '(c) 적용 결과 ⊆ 꺼짐 결과(좁히기만)')
  ok(en.ok && off.ok && en.queried === off.queried && JSON.stringify(en.guardDrop) === JSON.stringify(off.guardDrop) && JSON.stringify(en.devAudience) === JSON.stringify(off.devAudience), '(c) 기존 가드 집계는 그대로')
  for (const t of ['analysis_projects']) {
    const e1 = await G.loadApprovalPool(fake(tables, [t]), since, undefined, 'enforce')
    const s1 = await G.loadApprovalPool(fake(tables, [t]), since, undefined, 'shadow')
    // 'analysis_projects' 는 영역 가드(loadScope)도 읽어 기존 가드가 먼저 실패할 수 있다 — 어느 쪽이든 적용은 ok:false 여야 한다.
    ok(e1.ok === false, `(c) 적용 중 ${t} 조회 실패 → ok:false(확인 불가 → 승인 0건)`)
    ok(s1.ok === false || (ids(s1) === ids(off) && !!s1.entryRule?.error), `(c) 그림자 중 ${t} 조회 실패 → 대상 불변·오류 기록`)
  }
  // 입구 규칙만의 조회 실패: 기존 가드가 쓰지 않는 열(competitor_url) 대신, 원문 표를 두 번째 읽기부터 실패시킨다.
  {
    const mk = () => { const s = fake(tables); const f0 = s.from.bind(s); let n = 0; s.from = (t) => (t === 'analysis_inputs' && ++n > 2 ? fake(tables, [t]).from(t) : f0(t)); return s }
    const e2 = await G.loadApprovalPool(mk(), since, undefined, 'enforce')
    const s2 = await G.loadApprovalPool(mk(), since, undefined, 'shadow')
    ok(e2.ok === false && /입구 규칙/.test(e2.error), `(c) 적용: 입구 규칙 원문 조회 실패 → ok:false ${e2.ok ? '' : e2.error}`)
    ok(s2.ok && ids(s2) === ids(off) && /입구 규칙/.test(s2.entryRule?.error ?? ''), '(c) 그림자: 입구 규칙 조회 실패 → 대상 불변·오류 기록')
  }

  // (d) 직렬화
  const j = JSON.parse(JSON.stringify(E.ENTRY_RULES))
  ok(j.version === E.ENTRY_RULES_VERSION && j.thresholds.github_issues === null && typeof j.thresholds.hackernews === 'number' && j.requireAnchoredMention.includes('hackernews'), '(d) 설정 한 벌이 JSON 으로 그대로 나온다')

  // (g) v71dy 보강(er-v1.2) — 지어낸 글만
  const ALL = { setupPenalty: true, topicGate: true, nameWindow: true }
  const BT = {
    forumSetup: 'It keeps failing because the cron job stops. Make sure the config.php file has the right path and clear the cache.',
    obsPlugin: 'I use the calendar view daily because it is faster than the core one; custom plugins development is fun for my vault.',
    hnSelf: "I'm building a small tool for invoices because Acmenote got too expensive for my team. Let me know your thoughts!",
    hnTopic: 'Compilers in general deserve more love. I learned a lot from the dragon book. Error messages matter more than syntax. I use Acmenote for notes because it is cheaper than the rest.',
    hnLikeVerb: 'I like Acmenote a lot. It has been stable for years and the sync never lost a note.',
    hnEnum: 'Pricing it at $20 is steep when there are other editors (Foo, Acmenote, etc) for much cheaper.',
    hnFar: 'Acmenote came up in the thread. Weather was cold today. Trains were late. The office was empty. Lunch was soup. Then I realised the free plan is better than paid tools because it syncs.',
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  {
    const sample = [...Object.values(T), ...Object.values(BT)]
    const srcs = ['hackernews', 'mautic_forum', 'obsidian_forum', 'suitecrm_community', 'youtube', 'github_issues', 'appstore']
    ok(sample.every((t) => srcs.every((s) => { const o = V(t, s, 'Acmenote'); return same(o, E.entryVerdict(t, s, 'Acmenote', {})) && same(o, E.entryVerdict(t, s, 'Acmenote', null)) && same(o, E.entryVerdict(t, s, 'Acmenote', { setupPenalty: false, topicGate: false, nameWindow: false })) && o.version === E.ENTRY_RULES_VERSION })), '(g) 보강 꺼짐(생략·{}·null·전부 false) = er-v1.1 판정 그대로')
    ok(['setupPenalty', 'topicGate', 'nameWindow'].every((k) => E.entryVerdict(T.hnAnchored, 'hackernews', 'Acmenote', { [k]: true }).version === E.ENTRY_RULES_VERSION_BOOST) && E.ENTRY_RULES_VERSION_BOOST === 'er-v1.2' && E.entryVerdict(T.forumDev, 'appstore', null, ALL).version === 'er-v1.2', '(g) 하나라도 켜면 버전 er-v1.2')
    ok(E.entryVerdict(T.forumDev, 'appstore', null, ALL).pass && E.entryVerdict(T.hnAnchored, 'github_issues', 'Acmenote', ALL).pass === false && E.entryVerdict('', 'hackernews', 'Acmenote', ALL).pass === false, '(g) 보강 켜도 미적용 소스 통과·github 막음·글 없음 막음 그대로')
    ok(Object.isFrozen(E.ENTRY_BOOST_CHOSEN) && same(E.ENTRY_BOOST_CHOSEN, ALL), '(g) 고른 변형 = a+b+c, 얼려 둠')
    const fs0 = V(BT.forumSetup, 'mautic_forum', 'Mautic'), fsA = E.entryVerdict(BT.forumSetup, 'mautic_forum', 'Mautic', { setupPenalty: true })
    ok(fs0.pass && !fsA.pass && fsA.reasons.some((r) => r.startsWith('setup(config-file,runtime-ops,diagnostic-list)')), `(g-a) 포럼: 설정 파일·크론·캐시·"make sure" 묶음 → (a) 켜면 막음 ${fsA.score}`)
    ok(E.entryVerdict(BT.forumSetup, 'mautic_forum', 'Mautic', { topicGate: true, nameWindow: true }).pass, '(g-a) (a) 꺼짐이면 같은 글 통과(갈래가 서로 독립)')
    ok(E.entryVerdict(BT.obsPlugin, 'obsidian_forum', 'Obsidian', ALL).features.setupFamilies === 0, '(g-a) 옵시디언은 플러그인 개발 묶음을 보지 않는다(커뮤니티 플러그인 = 사용자 이야기)')
    const sb = E.entryVerdict(BT.hnSelf, 'hackernews', 'Acmenote', { setupPenalty: true })
    ok(sb.reasons.includes('self-build -30') && sb.score === V(BT.hnSelf, 'hackernews', 'Acmenote').score - 30, '(g-a) HN: "I\'m building… let me know your thoughts" → 자기 제작 −30')
    const tw = E.entryVerdict(BT.hnTopic, 'hackernews', 'Acmenote', { topicGate: true })
    ok(tw.reasons.some((r) => r.startsWith('topic-weak(1/4)')) && tw.score === V(BT.hnTopic, 'hackernews', 'Acmenote').score - 27, `(g-b) HN: 4문장 중 마지막 1문장만 제품 → 주제 약함 −27 (${tw.score})`)
    ok(E.entryVerdict('[HN: Acmenote raises prices · ▲10] ' + BT.hnTopic, 'hackernews', 'Acmenote', { topicGate: true }).reasons.every((r) => !r.startsWith('topic-weak')), '(g-b) 스레드 제목이 이 제품이면 주제 약함 아님')
    ok(!V(BT.hnLikeVerb, 'hackernews', 'Acmenote').pass && E.entryVerdict(BT.hnLikeVerb, 'hackernews', 'Acmenote', { nameWindow: true }).pass, '(g-c) "I like X" 의 like 는 동사 — (c) 켜면 언급으로 세어 통과(er-v1.1 은 예시로 오판)')
    ok(V(BT.hnEnum, 'hackernews', 'Acmenote').pass && !E.entryVerdict(BT.hnEnum, 'hackernews', 'Acmenote', { nameWindow: true }).pass, '(g-c) 열거 "(Foo, X, etc)" 속 언급 = 예시 → (c) 켜면 막음')
    const far = E.entryVerdict(BT.hnFar, 'hackernews', 'Acmenote', { nameWindow: true })
    ok(V(BT.hnFar, 'hackernews', 'Acmenote').pass && !far.pass && far.reasons.includes('window-no-judgement -25'), '(g-c) 제품명 문장 앞뒤 3문장 밖의 판단은 안 센다 → 막음')
    ok(E.sentences('One. Two? Three! See https://x.com/a.b now.\nFour').length === 5, '(g) 문장 나누기(URL 점은 안 끊음)')
  }

  // (e) 시간 상한
  const t0 = Date.now()
  for (const s of ['a-'.repeat(20000), 'Acme '.repeat(5000), '{'.repeat(10000) + ';', '<A' + 'x'.repeat(10000), 'Acme. '.repeat(3000)]) { E.entryVerdict(s, 'hackernews', 'Acme'); E.entryVerdict(s, 'hackernews', 'Acme', { setupPenalty: true, topicGate: true, nameWindow: true }) }
  ok(Date.now() - t0 < 2000, `(e) 적대적 긴 글 5개(꺼짐·보강) < 2초 (${Date.now() - t0}ms)`)
  return { pass, fails }
}

let total = 0, fail = 0
const E0 = await import('../lib/analysis/entry-rules.ts')
const G0 = await import('../lib/analysis/gradual-release.ts')
const r = await checks(E0, G0)
total += r.pass; fail += r.fails.length
for (const f of r.fails) console.error(`✗ ${f}`)

// (f) 변이
const LIB = join(ROOT, 'lib/analysis')
const libUrl = pathToFileURL(LIB + '/').href
const FILES = { E: 'entry-rules.ts', G: 'gradual-release.ts' }
const KEEP = new Set(Object.values(FILES))
const orig = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(LIB, f), 'utf8')]))
const base = mkdtempSync(join(tmpdir(), 'v71dx-mut-'))
const mutants = [
  ['E', '기본 켜짐', "if (!env || !on(env.ENTRY_RULES_ENABLED)) return 'off'", "if (!env) return 'enforce'"],
  ['E', 'github_issues 통과', 'github_issues: null,', 'github_issues: 0,'],
  ['E', '예시 언급도 제품 비중', 'if (EXAMPLE_BEFORE.test(t.slice(Math.max(0, at - 25), at))) { f.exampleMentions++; continue }', ''],
  ['E', 'HN 지나가는 언급 조건 없음', "requireAnchoredMention: ['hackernews'] as string[],", 'requireAnchoredMention: [] as string[],'],
  ['E', '홍보 감점 없음', 'promo: -30,', 'promo: 0,'],
  ['E', '설치 감점 없음', 'installPerStep: -10,', 'installPerStep: 0,'],
  ['E', '개발자 감점 없음', 'devPerToken: -8,', 'devPerToken: 0,'],
  ['E', '글 없음 통과', "return { score: 0, pass: false, reasons: ['no-text'], version }", 'return OFF'],
  ['E', '미적용 소스에도 적용', 'if (!Object.hasOwn(ENTRY_RULES.thresholds, src)) return anyBoost ? { ...OFF, version } : OFF', ''],
  ['E', '머리 꼬리표 안 뗌', "return text.replace(/^\\s*\\[[^\\]\\n]{0,300}\\]\\s*/, '')", 'return text'],
  ['E', '보강 (a) 감점 없음', 'setupPerFamily: -8,', 'setupPerFamily: 0,'],
  ['E', '보강 (a) 자기 제작 없음', 'selfBuild: -30,', 'selfBuild: 0,'],
  ['E', '보강 (a) 옵시디언에도 플러그인 개발', "obsidian_forum: ['config-file', 'runtime-ops', 'diagnostic-list'],", "obsidian_forum: ['config-file', 'runtime-ops', 'diagnostic-list', 'plugin-dev'],"],
  ['E', '보강 (b) 주제 감점 없음', 'topicWeak: -27,', 'topicWeak: 0,'],
  ['E', '보강 (b) 제목 무시', 'f.titleNames = !!title && nameRegex(p).test(title)', 'f.titleNames = false'],
  ['E', '보강 (c) like 동사 구분 없음', "(?<!\\b(?:I|we|you|they|really|also|would|'d|do|don'?t|didn'?t|not|still)\\s)like", 'like'],
  ['E', '보강 (c) 열거 언급도 셈', 'if (ENUM_AFTER.test(t.slice(at + hit[0].length, at + hit[0].length + 45))) continue', ''],
  ['E', '보강 (c) 창이 글 전체', 'windowSentences: 3,', 'windowSentences: 999,'],
  ['E', '보강 켜도 버전 그대로', 'const version = anyBoost ? ENTRY_RULES_VERSION_BOOST : ENTRY_RULES_VERSION', 'const version = ENTRY_RULES_VERSION'],
  ['E', '보강 기본 켜짐', 'setupPenalty: boost?.setupPenalty === true,', 'setupPenalty: boost?.setupPenalty !== false,'],
  ['G', '그림자인데 대상 좁힘', "targets: mode === 'enforce' ? keep : targets", 'targets: keep'],
  ['G', '적용 조회 실패를 통과로', "if (mode === 'enforce') return { ok: false, error }", ''],
  ['G', '꺼짐에도 적용', "if (entryMode === 'off') return base", ''],
]
const mut = []
for (const [i, [file, name, from, to]] of mutants.entries()) {
  if (!orig[file].includes(from)) { fail++; console.error(`✗ (f) 변이 지점 없음: ${name}`); continue }
  const dir = join(base, `m${i}`)
  mkdirSync(dir)
  for (const [k, f] of Object.entries(FILES)) {
    const text = (k === file ? orig[k].replace(from, to) : orig[k]).replace(/from '\.\/([^']+)'/g, (m, dep) => (KEEP.has(dep) ? m : `from '${libUrl}${dep}'`))
    writeFileSync(join(dir, f), text)
  }
  let m
  try { m = await checks(...await Promise.all(['E', 'G'].map((k) => import(pathToFileURL(join(dir, FILES[k])).href)))) } catch (e) { m = { fails: [`예외 ${e.message}`] } }
  mut.push({ 변이: `${FILES[file]} · ${name}`, 잡힌검사: m.fails.length, 예: (m.fails[0] ?? '').slice(0, 60) })
  if (m.fails.length > 0) total++; else { fail++; console.error(`✗ (f) 변이 "${name}" 를 검사가 못 잡는다`) }
}
console.table(mut)
console.log(`entry-rules selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
