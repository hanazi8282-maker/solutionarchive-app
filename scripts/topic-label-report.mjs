#!/usr/bin/env node
// v71bi §6 — review_topic_labels 를 영역 후보 순위표로 집계한다(읽기 전용). 원문은 읽지 않고 인용하지 않는다(건수·이름만).
//   node --env-file=.env.local scripts/topic-label-report.mjs [--pv=topic-v1-2026-10-26] [--out=reports/2026-10-26/area-candidates-final]
import { writeFileSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const PV = arg('pv', 'topic-v1-2026-10-26'); const OUT = arg('out', 'reports/2026-10-26/area-candidates-final')
const DAY = arg('day', '')
const sb = await createClient()
const labels = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from('review_topic_labels').select('input_id, project_id, batch_id, area_guess, category_group, category_label, product_name, is_saas, reason_quality, lang, confidence').eq('prompt_version', PV).order('id').range(f, f + 999); if (error) { console.error(error); process.exit(2) } labels.push(...data); if (data.length < 1000) break }
if (DAY) { for (let i = labels.length - 1; i >= 0; i--) if (!String(labels[i].batch_id ?? '').includes(`-d${DAY}-`)) labels.splice(i, 1) }
const meta = new Map()
for (let i = 0; i < labels.length; i += 100) { const { data, error } = await sb.from('analysis_inputs').select('id, rating, source_key, lang').in('id', labels.slice(i, i + 100).map((l) => l.input_id)); if (error) { console.error(error); process.exit(2) } data.forEach((x) => meta.set(x.id, x)) }

// 대분류 이름 정규화: 괄호 설명·공백 차이로 갈린 같은 이름을 합친다(독립 채점에서 나온 일관성 문제의 보정 — 라벨 원본은 그대로).
const norm = (g) => { const s = String(g ?? 'unknown').replace(/\s*[(（].*?[)）]/g, '').replace(/\s+/g, ' ').trim(); return s || 'unknown' }
const ACTIVE = new Set(['1', '2', '3', '4', '5', 'work', 'design'])
const isFounderTalk = (g) => g.startsWith('창업가 일반'); const isUnknown = (g) => g === 'unknown'; const isConsumer = (g) => g.startsWith('실물 소비재')
const grp = new Map()
for (const l of labels) {
  const g = norm(l.category_group); const m = meta.get(l.input_id) ?? {}
  const o = grp.get(g) ?? { g, n: 0, proj: new Set(), prod: new Set(), reason: 0, rated: 0, ko: 0, src: {}, area: {}, labels: {}, saas: 0 }
  o.n++; o.proj.add(l.project_id); if (l.product_name) o.prod.add(l.product_name.toLowerCase().trim())
  if (l.reason_quality === 'reason') o.reason++; if (m.rating != null && Number(m.rating) > 0) o.rated++
  if ((l.lang ?? m.lang) === 'ko') o.ko++; if (l.is_saas === true) o.saas++
  o.src[m.source_key ?? '?'] = (o.src[m.source_key ?? '?'] ?? 0) + 1; o.area[l.area_guess] = (o.area[l.area_guess] ?? 0) + 1
  if (l.category_label) o.labels[l.category_label] = (o.labels[l.category_label] ?? 0) + 1
  grp.set(g, o)
}
const all = [...grp.values()]; const total = labels.length
const cnt = (pred) => all.filter((o) => pred(o.g)).reduce((s, o) => s + o.n, 0)
const founder = cnt(isFounderTalk), unknown = cnt(isUnknown), consumer = cnt(isConsumer)
const rows = all.filter((o) => !isFounderTalk(o.g) && !isUnknown(o.g) && !isConsumer(o.g)).sort((a, b) => b.n - a.n)
const pct = (x, y) => (y ? `${Math.round((100 * x) / y)}%` : '-')
const top = (o, k = 3) => Object.entries(o.src).sort((a, b) => b[1] - a[1]).slice(0, k).map(([s, n]) => `${s} ${n}`).join(', ')
const inArea = (o) => pct(Object.entries(o.area).filter(([a]) => ACTIVE.has(a)).reduce((s, [, n]) => s + n, 0), o.n)
const score = (o) => Number((o.n * (o.reason / o.n)).toFixed(0))
const SEED_GROUPS = new Set(['개발·인프라', '웹·제품 분석', '노코드·자동화·내부 도구', '이메일·뉴스레터·메일함', '결제·판매·구독 관리', '폼·일정·전자서명', '영상·화이트보드·화상 협업', '읽기·북마크·구독 리더', '퍼블리싱·블로그·팟캐스트', '회계·재무·가계부', '고객지원·헬프데스크', '교육·강의', '프리랜서·원격 채용', '운세·점술·라이프스타일'])
const md = []
md.push(`# 영역 후보 집계 (${PV})`, '', `- 라벨 ${total}건 · 서로 다른 프로젝트 ${new Set(labels.map((l) => l.project_id)).size}개`, `- 제외 집계: 창업가 일반 고민(제품 아님) ${founder}건 · 제품 불명(unknown) ${unknown}건 · 실물 소비재 ${consumer}건`, '', '## 표 1 — 영역 후보 순위 (글 수 순)', '', '| 대분류 | 글 수 | 프로젝트 | 제품 | reason 비율 | 별점 있는 글 | 한국어 글 | 소스 상위 | 이미 활성 영역으로 분류된 비율 |', '|---|---|---|---|---|---|---|---|---|')
for (const o of rows.slice(0, 30)) md.push(`| ${o.g} | ${o.n} | ${o.proj.size} | ${o.prod.size} | ${pct(o.reason, o.n)} | ${o.rated} | ${o.ko} | ${top(o)} | ${inArea(o)} |`)
md.push('', '## 표 2 — 새 영역으로 열 만한가 (점수 = 글 수 × reason 비율, 즉 reason 글 수)', '', '결론서 조건: 한국어 별점 리뷰 100건 이상 앱 3곳 이상. 아래 "조건 충족 후보"는 별점 있는 글과 한국어 글이 둘 다 100건 이상인 대분류.', '', '| 대분류 | 점수 | 제품 3곳 이상 | 별점 글 | 한국어 글 | 결론서 재료 조건 |', '|---|---|---|---|---|---|')
for (const o of [...rows].sort((a, b) => score(b) - score(a)).slice(0, 15)) md.push(`| ${o.g} | ${score(o)} | ${o.prod.size >= 3 ? '예' : '아니오'} | ${o.rated} | ${o.ko} | ${o.rated >= 100 && o.ko >= 100 ? '충족' : '미충족'} |`)
md.push('', '## 표 3 — 의외의 발견: 사전에 없던 새 대분류 상위 10', '', '| 대분류 | 글 수 | 대표 구체 종류 |', '|---|---|---|')
for (const o of rows.filter((o) => !SEED_GROUPS.has(o.g)).slice(0, 10)) md.push(`| ${o.g} | ${o.n} | ${Object.entries(o.labels).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, n]) => `${l} ${n}`).join(', ')} |`)
md.push('', '## 구체 종류(category_label) 상위 25', '', ...Object.entries(labels.reduce((m, l) => { const k = `${norm(l.category_group)} / ${l.category_label}`; m[k] = (m[k] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `- ${k}: ${n}`))
md.push('', '## 정직 고지', '', '1. 이 풀은 이미 모은 회사들의 글이라 수집한 적 없는 영역은 아예 안 보인다. 타로·운세가 풀에 적다고 시장이 작다는 뜻이 아니다(전체 입력에서 타로/tarot 31건, 사주/horoscope 78건).', '2. 상위 프로젝트는 별점이 없고 영어가 대부분이라 글 수가 많아도 결론서를 바로 만들 재료가 아니다.', '3. 라벨은 영역 판정이 아니라 후보 탐색용이다. 같은 제품 종류가 다른 대분류 이름으로 갈릴 수 있어 괄호 설명만 합쳤다(독립 채점: 영역 97/100, 대분류 이름 적절 87/100).')
writeFileSync(`${OUT}.md`, md.join('\n')); writeFileSync(`${OUT}.json`, JSON.stringify({ pv: PV, total, founder, unknown, consumer, groups: rows.map((o) => ({ group: o.g, n: o.n, projects: o.proj.size, products: o.prod.size, reason: o.reason, rated: o.rated, ko: o.ko, area: o.area, src: o.src })) }, null, 1))
console.log(md.slice(0, 40).join('\n'))
