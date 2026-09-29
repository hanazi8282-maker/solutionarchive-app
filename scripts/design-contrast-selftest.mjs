#!/usr/bin/env node
/**
 * 팔레트 대비 검사 (2026-09-30, reports/2026-09-30/design-direction-decisions.md B1 수용기준).
 * 값은 `app/_ds/tokens/sa.css` 에서 직접 읽는다 — 문서에 적은 대비 숫자를 기계가 지키게 한다.
 * WCAG 2.1 sRGB 상대휘도. 문턱: 글자 4.5, 선·아이콘·포커스 3.0. rgba 전경은 배경 위에 합성해서 잰다.
 * §7.1: 토큰을 못 읽으면 통과가 아니라 실패다. 공식 자체는 흑/백 = 21 로 먼저 확인한다.
 * `--mutate`: 뮤트를 faint(#a3adb8, 장식 전용)로 바꾼 셈 치고 센다 — 그때 **실패를 잡아야** 통과(검사가 헛돌지 않는지).
 */
import { readFileSync } from 'node:fs'

const MUTATE = process.argv.includes('--mutate')
let css = readFileSync(new URL('../app/_ds/tokens/sa.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
if (MUTATE) css = css.replace(/--sa-muted:[^;]+;/, '--sa-muted: #a3adb8;')
const tok = (n) => { const m = css.match(new RegExp(`--sa-${n}:\\s*([^;]+);`)); if (!m) throw new Error(`sa.css 에 --sa-${n} 없음`); return m[1].trim() }
const rgba = (v) => v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).concat(1) : v.match(/[\d.]+/g).map(Number)
const lum = ([r, g, b]) => [r, g, b].map((c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (fg, bg) => { const b = rgba(bg), f = rgba(fg), a = f[3] ?? 1; const c = f.slice(0, 3).map((x, i) => x * a + b[i] * (1 - a)); const [hi, lo] = [lum(c), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

if (Math.abs(ratio('#000000', '#ffffff') - 21) > 0.01) { console.error('FAIL: 대비 공식이 흑/백 21 을 못 낸다'); process.exit(1) }

const LIGHT = ['canvas', 'plane-accent', 'plane-ice', 'plane-lilac']
const PAIRS = [
  ...LIGHT.flatMap((bg) => ['ink', 'muted', 'accent'].map((fg) => [fg, bg, 4.5])),          // 본문·액센트 글자
  ...LIGHT.flatMap((bg) => ['verdict-pos', 'verdict-neg', 'verdict-mix'].map((fg) => [fg, bg, 3])), // 판정색 선·아이콘
  ['accent-ink', 'accent', 4.5], ['accent-ink', 'accent-hover', 4.5], ['ink', 'flash', 4.5],
  ['dark-ink', 'dark-canvas', 4.5], ['dark-muted', 'dark-canvas', 4.5],
  ['focus', 'canvas', 3], ['dark-focus', 'dark-canvas', 3], ['flash', 'dark-canvas', 3],
  // G3: 상세 신원 칩(surface-2 면 위 라벨·값) · 근거 종류 칩(surface 위 뮤트)
  ['ink', 'surface-2', 4.5], ['muted', 'surface-2', 4.5], ['muted', 'surface', 4.5],
]
// 다크 배너(G1): 그라데이션 밝은 끝 = dark-canvas 에 액센트 N% 혼합, 그 위 흑백 노이즈 최대 불투명도 → 최악은 흰색 op 합성.
// 두 숫자를 pub.css 에서 읽는다 — 못 읽으면 통과가 아니라 실패(§7.1).
const pub = readFileSync(new URL('../app/_pub/pub.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const mixM = pub.match(/color-mix\(in srgb, var\(--sa-dark-canvas\) (\d+)%, var\(--sa-([\w-]+)\)\)/)
const noiseM = pub.match(/feTurbulence[^"]*opacity='([\d.]+)'/)
if (!mixM || !noiseM) { console.error('FAIL: pub.css 다크 배너 그라데이션·노이즈 값을 못 읽었다(확인 불가)'); process.exit(1) }
const blend = (a, b, t) => a.slice(0, 3).map((x, i) => x * (1 - t) + b[i] * t)
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
const lightEnd = blend(rgba(tok('dark-canvas')), rgba(tok(mixM[2])), 1 - Number(mixM[1]) / 100)
const bannerWorst = hex(blend(lightEnd, [255, 255, 255], Number(noiseM[1])))
const EXTRA = { 'banner-worst': bannerWorst }
PAIRS.push(['dark-ink', 'banner-worst', 4.5], ['dark-muted', 'banner-worst', 4.5], ['dark-focus', 'banner-worst', 3], ['flash', 'banner-worst', 3])
console.log(`banner-worst = ${bannerWorst} (dark-canvas ${mixM[1]}% + ${mixM[2]}, 노이즈 흰색 ${noiseM[1]})`)

let bad = 0
for (const [fg, bg, min] of PAIRS) {
  const r = ratio(tok(fg), EXTRA[bg] ?? tok(bg))
  if (r < min) bad++
  console.log(`${r >= min ? 'ok  ' : 'FAIL'} ${fg} on ${bg}: ${r.toFixed(2)} (>= ${min})`)
}
if (MUTATE) { if (!bad) { console.error('FAIL: 변이(뮤트=faint)를 넣었는데도 통과했다'); process.exit(1) } console.log(`[design-contrast] 변이 확인 OK — 미달 ${bad}건을 잡았다`); process.exit(0) }
if (bad) { console.error(`FAIL: 대비 문턱 미달 ${bad}/${PAIRS.length}`); process.exit(1) }
console.log(`[design-contrast] PASS — ${PAIRS.length}개 조합 전부 문턱 이상`)
