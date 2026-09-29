#!/usr/bin/env node
/**
 * 디자인 토큰 정본 검사 (2026-09-29, `pub-tokens-overlap-selftest.mjs` 를 대체).
 *
 * 전 판은 `_pub` 와 `_ds` 가 **값을 공유하지 않는지**를 셌다 — 두 벌이 갈라진 시절의 검사다.
 * 09-29 남헌 승인으로 앱은 한 벌(`app/_ds/tokens/sa.css`)만 읽는다. 그래서 이제 세는 것은 반대다:
 *
 *  1. **값을 적은 자리가 sa.css 하나뿐인가.** 검사 대상 파일(아래 COVERED)에 리터럴 색(hex·rgb·rgba·hsl)과
 *     리터럴 반경(border-radius / borderRadius 의 px·rem·em)이 없어야 한다. 주석은 지우고 센다.
 *  2. **DESIGN.md 와 sa.css 의 토큰 이름이 같은가.** DESIGN.md 는 정본이고 sa.css 는 그 구현이다.
 *     한쪽에만 있는 `--sa-*` 는 문서가 낡았거나 코드가 몰래 늘어난 것이다.
 *  3. (구조) 내부 화면은 `.sa-v2` 스코프를 두르고, 인라인 style 을 쓰지 않고, 쓰는 `.v2-*` 클래스가
 *     v2.css 에 정의돼 있다 — 전 판에서 그대로 가져온 검사. 오타 난 클래스는 스타일이 조용히 빠진다.
 *
 * §7.1: 검사 대상 파일을 하나도 못 찾으면 위반 0 이 아니라 **확인 불가**라 실패로 낸다.
 * 변이 확인: `--mutate` 는 대상 파일 하나에 `#0f172a` 를 넣은 셈 치고 다시 센다. 그때도 통과면 검사가 헛돈 것이다.
 *
 * 허용 예외(이유가 붙은 것만):
 *  - `hsl(` 안에 `var(` 나 `${` 가 있는 것 — 브랜드 로고 듀오톤 hue 는 데이터값이다(BrandLogo·pub-logo).
 *  - `transparent` · `currentColor` · `rgba(0,0,0,0)` — 색이 아니라 "없음".
 *  - `border-radius: 0 / 50% / inherit` — 반경이 아니라 원·없음.
 *  - `opengraph-image.tsx` · `api/…/route.tsx` — 화면이 아니라 이미지 렌더러(next/og). 대상에서 뺀다.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TOKENS = join(ROOT, 'app', '_ds', 'tokens', 'sa.css')
const DESIGN = join(ROOT, 'DESIGN.md')
const V2 = join(ROOT, 'app', '_ds', 'v2', 'v2.css')

/** 리터럴 검사 대상. 디자인 시스템이 손댄 파일 집합 — 화면을 옮길 때 여기 한 줄씩. */
const COVERED = [
  { dir: join(ROOT, 'app', '_ds'), deep: true },
  { dir: join(ROOT, 'app', '_pub'), deep: true },
  { dir: join(ROOT, 'app', 'agents'), deep: true },
  { dir: join(ROOT, 'app', 'discovery'), deep: true },
  { dir: join(ROOT, 'app', 'dashboard'), deep: true },
  { dir: join(ROOT, 'app', 'columns'), deep: true },
  { dir: join(ROOT, 'app', 'cases'), deep: true },
  { dir: join(ROOT, 'app', 'analyze'), deep: true },
  { dir: join(ROOT, 'app', 'settings'), deep: true },
  { dir: join(ROOT, 'app', 'relevance'), deep: true },
  { dir: join(ROOT, 'app', 'library'), deep: true },
  { dir: join(ROOT, 'app', 'signals'), deep: true },
  { dir: join(ROOT, 'app', 'onboarding'), deep: true },
  { dir: join(ROOT, 'app', 'login'), deep: true },
]
/** `.sa-v2` 스코프를 둘러야 하는 내부 page.tsx (ROOT/app 기준). */
const M2_PAGES = ['agents', 'discovery', 'dashboard', 'columns', join('cases', 'grade'), 'analyze', join('analyze', 'new'),
  join('analyze', '[id]', 'angles'), join('analyze', '[id]', 'result'), join('analyze', '[id]', 'review'), 'cases',
  join('cases', 'search'), join('cases', 'report'), join('settings', 'profile'), join('relevance', 'grade'), join('relevance', 'feedback')]
const M2_DIRS = ['agents', 'discovery', 'dashboard', 'cases', 'analyze', 'settings', 'relevance'].map((d) => join(ROOT, 'app', d))

const EXCLUDE = /opengraph-image\.tsx$|[\\/]api[\\/].*route\.tsx$|[\\/]tokens[\\/]sa\.css$/

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

function walk(dir, hits = [], deep = true) {
  if (!existsSync(dir)) return hits
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (deep) walk(p, hits) }
    else if (/\.(css|tsx)$/.test(name) && !EXCLUDE.test(p)) hits.push(p)
  }
  return hits
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g
const RADIUS_RE = /border-radius\s*:\s*([^;}]+)|borderRadius\s*:\s*([^,}]+)/g

/** 한 파일의 위반 목록. 반환값이 비면 통과. */
function violations(src) {
  const s = strip(src)
  const out = []
  for (const m of s.matchAll(COLOR_RE)) {
    const v = m[0]
    if (/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(v)) continue
    if (/^hsla?\(/.test(v) && /var\(|\$\{/.test(v)) continue
    if (/^#\d+$/.test(v)) continue // PR 번호 같은 주석 밖 숫자 (#264) 는 색이 아니다
    out.push(`color ${v}`)
  }
  for (const m of s.matchAll(RADIUS_RE)) {
    const val = (m[1] ?? m[2] ?? '').trim()
    for (const tok of val.split(/\s+/)) {
      if (/^[\d.]+(px|rem|em)$/i.test(tok) && parseFloat(tok) > 0) out.push(`radius ${tok}`)
    }
  }
  return out
}

const mutateMode = process.argv.includes('--mutate')
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1) }
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/')

// ── 1. 리터럴 ────────────────────────────────────────────────────────────
const files = COVERED.flatMap(({ dir, deep }) => walk(dir, [], deep))
if (files.length === 0) fail('검사 대상 파일을 하나도 못 찾았다 (위반 0 이 아니라 확인 불가다)')
const hits = []
for (const f of files) {
  let src = readFileSync(f, 'utf8')
  if (mutateMode && f === files[0]) src += '\n.x { color: #0f172a; }\n'
  for (const v of violations(src)) hits.push(`${rel(f)} ${v}`)
}
console.log(`[design-tokens] 리터럴 검사 파일 ${files.length}개`)
if (mutateMode) {
  if (hits.length === 0) fail('변이(#0f172a 주입)를 넣었는데도 통과했다 — 이 검사는 아무것도 지키지 않는다')
  console.log('[design-tokens] 변이 확인 OK — 주입한 값을 잡았다:', hits.join(', '))
  process.exit(0)
}
if (hits.length) fail(`sa.css 밖의 리터럴 색·반경 ${hits.length}건:\n  ${hits.join('\n  ')}`)

// ── 2. DESIGN.md ↔ sa.css 이름 대조 ───────────────────────────────────────
if (!existsSync(DESIGN)) fail('DESIGN.md 가 없다 — 정본 없이 토큰만 있는 상태다')
const names = (s) => new Set([...s.matchAll(/--sa-[\w-]+/g)].map((m) => m[0]))
const inCss = new Set([...strip(readFileSync(TOKENS, 'utf8')).matchAll(/(--sa-[\w-]+)\s*:/g)].map((m) => m[1]))
const inDoc = names(readFileSync(DESIGN, 'utf8'))
if (inCss.size === 0) fail('sa.css 에서 --sa-* 선언을 하나도 못 뽑았다')
const onlyCss = [...inCss].filter((n) => !inDoc.has(n))
const onlyDoc = [...inDoc].filter((n) => !inCss.has(n))
if (onlyCss.length) fail(`sa.css 에만 있고 DESIGN.md 에 없는 토큰 ${onlyCss.length}개: ${onlyCss.join(', ')}`)
if (onlyDoc.length) fail(`DESIGN.md 에만 있고 sa.css 에 없는 토큰 ${onlyDoc.length}개: ${onlyDoc.join(', ')}`)
console.log(`[design-tokens] DESIGN.md ↔ sa.css 토큰 ${inCss.size}개 일치`)

// ── 3. 내부 화면 구조 ─────────────────────────────────────────────────────
const v2Css = strip(readFileSync(V2, 'utf8'))
const unwrapped = M2_PAGES.map((d) => join(ROOT, 'app', d, 'page.tsx')).filter((f) => !readFileSync(f, 'utf8').includes('className="sa-v2"'))
if (unwrapped.length) fail(`.sa-v2 스코프를 안 두른 화면 ${unwrapped.length}개 — ${unwrapped.map(rel).join(', ')}`)
const m2Files = M2_DIRS.flatMap((d) => walk(d, [], true)).concat(walk(join(ROOT, 'app', 'columns'), [], false))
const inline = m2Files.filter((f) => /\bstyle=\{/.test(readFileSync(f, 'utf8')))
if (inline.length) fail(`인라인 style 이 남은 내부 화면 파일 ${inline.length}개 — ${inline.map(rel).join(', ')}`)
const definedCls = new Set([...v2Css.matchAll(/\.(v2-[\w-]+)/g)].map((m) => m[1]))
const undefinedCls = [...new Set(m2Files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\b(v2-[\w-]+)/g)].map((m) => m[1])))].filter((c) => !definedCls.has(c))
if (undefinedCls.length) fail(`v2.css 에 없는 클래스 ${undefinedCls.length}개(오타면 스타일이 조용히 빠진다): ${undefinedCls.join(', ')}`)
// v2.css 가 읽는 --v2-* / --sa-* 는 전부 선언돼 있어야 한다(없으면 var() 가 무효가 되어 규칙째 버려진다).
const declaredV2 = new Set([...v2Css.matchAll(/(--v2-[\w-]+)\s*:/g)].map((m) => m[1]))
const usedV2 = [...new Set([...v2Css.matchAll(/var\((--v2-[\w-]+)/g)].map((m) => m[1]))].filter((n) => !declaredV2.has(n))
if (usedV2.length) fail(`v2.css 가 읽는데 선언이 없는 변수: ${usedV2.join(', ')}`)
const allCss = files.filter((f) => f.endsWith('.css')).map((f) => strip(readFileSync(f, 'utf8'))).join('\n')
const usedSa = [...new Set([...allCss.matchAll(/var\((--sa-[\w-]+)/g)].map((m) => m[1]))].filter((n) => !inCss.has(n))
if (usedSa.length) fail(`sa.css 에 없는 --sa-* 를 읽는 곳: ${usedSa.join(', ')}`)
// 운영 화면 모션 금지(B6, 2026-09-30): 키프레임은 공개 `pub.css` 에만. 운영 스타일시트에 생기면 실패.
const opsCss = [V2, join(ROOT, 'app', '_ds', 'styles.css')]
const missingOps = opsCss.filter((f) => !existsSync(f))
if (missingOps.length) fail(`운영 스타일시트를 못 찾았다(확인 불가): ${missingOps.map(rel).join(', ')}`)
const opsKeyframes = opsCss.filter((f) => /@keyframes\b/.test(strip(readFileSync(f, 'utf8'))))
if (opsKeyframes.length) fail(`운영 화면 스타일시트에 @keyframes: ${opsKeyframes.map(rel).join(', ')}`)
console.log(`[design-tokens] PASS — 리터럴 0 · 내부 화면 ${M2_PAGES.length}/${M2_PAGES.length} 스코프 · 인라인 style 0 · .v2-* 전부 정의 · 미선언 변수 0 · 운영 @keyframes 0`)
