#!/usr/bin/env node
/**
 * `app/_pub` 토큰이 두더지웍스(`app/_ds`)에서 승계된 값을 쓰지 않는지 센다.
 *
 * 왜 검사인가. 2026-09-23 의 `_pub` 는 **컴포넌트만** 새로 짜고 토큰은 `_ds` 를 그대로
 * 물려받았다(Pretendard 단일 서체 · Tailwind slate 뉴트럴 · 4px 리듬 · 임의 그림자).
 * 40개 중 23개가 값까지 같았는데, 화면은 멀쩡해 보여서 아무도 못 잡았다. 그래서 값을
 * 기계가 센다 — 사람 눈으로는 "비슷한 회색"과 "같은 회색"이 구분되지 않는다.
 *
 * 세는 것: 색(hex·rgb/rgba) · 반경(border-radius) · 그림자(box-shadow) · easing(cubic-bezier) ·
 *          서체 스택(font-family). **간격(px)은 세지 않는다** — 레퍼런스도 8의 배수라
 *          같아질 수밖에 없고, 그걸 겹침으로 세면 검사가 거짓 빨강이 된다(아래 REPORT 참고).
 *
 * §7.1: "확인 불가"를 통과로 접지 않는다. 한쪽 파일 집합이 비면(경로 오타·파일 이동)
 *        겹침 0 이 나오지만 그건 통과가 아니라 **못 센 것**이라 실패로 낸다.
 *
 * 변이 확인: `--mutate` 로 돌리면 `_pub` 색 하나를 `_ds` 의 슬레이트(#0f172a)로 바꾼 셈 치고
 *        다시 센다. 그때도 통과가 나오면 이 검사는 아무것도 지키지 않는 것이다.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const PUB_DIR = join(ROOT, 'app', '_pub')
const DS_FILES = [
  join(ROOT, 'app', '_ds', 'styles.css'),
  ...readdirSync(join(ROOT, 'app', '_ds', 'tokens')).map((f) => join(ROOT, 'app', '_ds', 'tokens', f)),
]

/**
 * 표에 없는데 겹치는 것이 **불가피한** 값. 이유를 적지 않은 값은 여기 못 들어온다.
 * 이 목록이 늘어나는 것 자체가 신호다 — 늘리기 전에 값을 바꿀 수 있는지 먼저 본다.
 */
const UNAVOIDABLE = new Map([
  ['color:#ffffff', '흰색. 카드 표면·액센트 위 글자로 남헌 표가 지정한 값이고, 디자인 언어가 아니라 원색이다'],
  ['color:#1d4ed8', '액센트 #1D4ED8 — 남헌 확정·변경 금지. _ds 는 같은 값을 --blue-700(팔레트 램프)으로 들고 있다'],
  ['radius:12px', '썸네일 반경 12 — 남헌 표 지정. _ds 의 --radius-xl 과 값이 같다(그쪽은 모달용)'],
])

// ── 추출 ────────────────────────────────────────────────────────────────

/** 주석을 지운다 — 주석 속 예시 값(#0f172a 같은 것)을 실사용으로 세면 거짓 빨강이 난다. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const num = (s) => String(parseFloat(s))

function normColor(raw) {
  const t = raw.trim().toLowerCase()
  if (t.startsWith('#')) {
    let h = t.slice(1)
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length === 6) return `#${h}`
    if (h.length === 8) return `#${h}` // 알파 포함 8자리는 그대로 둔다
    return null
  }
  const m = t.match(/^rgba?\(([^)]*)\)$/)
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(num)
  if (parts.length === 3) parts.push('1')
  return `rgba(${parts.join(',')})`
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g
const DECL_RE = (prop) => new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'gi')

/** 한 파일에서 종류별 값 집합을 뽑는다. */
function extract(css) {
  const src = strip(css)
  const out = { color: new Set(), radius: new Set(), shadow: new Set(), ease: new Set(), font: new Set() }

  for (const m of src.matchAll(COLOR_RE)) {
    const c = normColor(m[0])
    // 완전 투명은 색이 아니라 "없음"이다.
    if (c && c !== 'rgba(0,0,0,0)') out.color.add(c)
  }

  // 반경·그림자는 **거의 전부 커스텀 프로퍼티 선언**으로 산다(`--pub-round-card: 20px`,
  // `--radius-lg: 8px`). `border-radius: var(--…)` 만 훑으면 아무것도 안 잡혀 겹침이
  // 항상 0 이 된다 — 그 구멍이 §7.1 이 말하는 "거짓 통과"다.
  const radiusDecls = [...src.matchAll(DECL_RE('border-radius'))]
    .concat([...src.matchAll(/--[\w-]*(?:round|radius)[\w-]*\s*:\s*([^;}]+)/gi)])
  for (const m of radiusDecls) {
    for (const tok of m[1].trim().split(/\s+/)) {
      if (/^[\d.]+(px|rem|em|%)$/i.test(tok) && parseFloat(tok) > 0) out.radius.add(tok.toLowerCase())
    }
  }

  const shadowDecls = [...src.matchAll(DECL_RE('box-shadow'))]
    .concat([...src.matchAll(/--[\w-]*(?:shadow|lift)[\w-]*\s*:\s*([^;}]+)/gi)])
  for (const m of shadowDecls) {
    const v = m[1].trim().toLowerCase().replace(/\s+/g, ' ')
    // `none` 과 var() 참조는 값이 아니다(값은 참조된 곳에서 이미 세어진다).
    if (v !== 'none' && !v.startsWith('var(')) out.shadow.add(v)
  }

  for (const m of src.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
    out.ease.add(`cubic-bezier(${m[1].split(',').map(num).join(',')})`)
  }

  for (const m of src.matchAll(DECL_RE('font-family'))) {
    const v = m[1].trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',')
    if (!/^var\(--(pub-type|font-sans|font-mono)/.test(v)) out.font.add(v)
  }

  // CSS 변수로 선언된 서체 스택도 센다(--pub-type / --font-sans 가 그 자리다).
  for (const m of src.matchAll(/--[\w-]*(?:type|font)[\w-]*\s*:\s*([^;}]+)/gi)) {
    const v = m[1].trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',')
    if (v.includes(',')) out.font.add(v)
  }

  return out
}

function readAll(files) {
  const merged = { color: new Set(), radius: new Set(), shadow: new Set(), ease: new Set(), font: new Set() }
  for (const f of files) {
    const one = extract(readFileSync(f, 'utf8'))
    for (const k of Object.keys(merged)) for (const v of one[k]) merged[k].add(v)
  }
  return merged
}

function walk(dir, hits = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, hits)
    else if (/\.(css|tsx)$/.test(name)) hits.push(p)
  }
  return hits
}

// ── 실행 ────────────────────────────────────────────────────────────────

const KINDS = ['color', 'radius', 'shadow', 'ease', 'font']

function run({ mutate = false } = {}) {
  const pubFiles = walk(PUB_DIR)
  const pub = readAll(pubFiles)
  const ds = readAll(DS_FILES)

  // 변이: `_ds` 슬레이트 900 을 `_pub` 가 쓰고 있는 셈 친다. 통과가 나오면 검사가 헛돈 것이다.
  if (mutate) pub.color.add('#0f172a')

  const overlaps = []
  for (const kind of KINDS) {
    for (const v of pub[kind]) {
      if (ds[kind].has(v)) overlaps.push({ kind, value: v })
    }
  }

  const unexplained = overlaps.filter((o) => !UNAVOIDABLE.has(`${o.kind}:${o.value}`))
  return { pubFiles, pub, ds, overlaps, unexplained }
}

function counts(sets) {
  return KINDS.map((k) => `${k} ${sets[k].size}`).join(' · ')
}

const mutateMode = process.argv.includes('--mutate')
const r = run({ mutate: mutateMode })

console.log('[pub-tokens-overlap] _pub 파일', r.pubFiles.length, '개 ·', counts(r.pub))
console.log('[pub-tokens-overlap] _ds  파일', DS_FILES.length, '개 ·', counts(r.ds))

// §7.1 — 못 센 것을 겹침 0 으로 읽지 않는다.
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1) }

if (r.pubFiles.length === 0) fail('app/_pub 에서 검사할 파일을 하나도 못 찾았다 (겹침 0 이 아니라 확인 불가다)')
for (const kind of KINDS) {
  if (r.pub[kind].size === 0) fail(`_pub 에서 ${kind} 값을 하나도 못 뽑았다 — 추출기가 깨졌거나 토큰이 사라졌다`)
  if (r.ds[kind].size === 0) fail(`_ds 에서 ${kind} 값을 하나도 못 뽑았다 — 비교 대상이 비면 겹침은 항상 0 이다`)
}

if (mutateMode) {
  // 변이 모드는 **실패해야** 정상이다.
  if (r.unexplained.length === 0) fail('변이(#0f172a 주입)를 넣었는데도 통과했다 — 이 검사는 아무것도 지키지 않는다')
  console.log('[pub-tokens-overlap] 변이 확인 OK — 주입한 값을 잡았다:', r.unexplained.map((o) => o.value).join(', '))
  process.exit(0)
}

for (const o of r.overlaps) {
  const why = UNAVOIDABLE.get(`${o.kind}:${o.value}`)
  console.log(`  ${why ? '허용' : '겹침'} ${o.kind} ${o.value}${why ? ` — ${why}` : ''}`)
}

// 간격은 따로 보고만 한다(겹침으로 세지 않는다).
console.log('[pub-tokens-overlap] 간격(px)은 제외했다 — 레퍼런스 4곳도 8의 배수라 _ds 의 4/8/12/16/20/24/32/40 과 겹친다. 의도된 것이고 디자인 승계가 아니다.')

if (r.unexplained.length > 0) {
  fail(`설명되지 않은 겹침 ${r.unexplained.length}건: ` + r.unexplained.map((o) => `${o.kind} ${o.value}`).join(', '))
}
console.log(`[pub-tokens-overlap] PASS — 설명되지 않은 겹침 0건 (불가피 ${r.overlaps.length}건은 위에 이유와 함께 적혀 있다)`)
