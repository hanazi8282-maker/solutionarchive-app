// E0 collect_company — 회사 공개 페이지에서 사실을 모은다(진단의 근거 재료). 외부 서비스 호출은 이 한 파일에 모은다.
//  - robots.txt 를 못 읽으면(네트워크 오류·5xx) 허용이 아니라 "판단 불가" → 가지 않는다(CLAUDE.md §7.1). 404(파일 없음)는 확정 답이라 허용.
//  - 홈 + 같은 출처의 소개·가격·기능 류 페이지 최대 3개. 본문 상한, 타임아웃. 로그인·캡차·우회 없음.
//  - 얇으면(thin) 실패가 아니다 — 한 줄 설명만으로도 진단은 돈다(T11).
import { normalizeCompanyUrl } from './url.ts'

const UA = 'SolutionArchiveBot/1.0 (+https://solutionarch.vercel.app)'
const MAX_BYTES = 400_000
const MAX_PAGES = 4
const WANT = /(about|company|pricing|price|plans?|features?|product|solutions?|소개|가격|요금|기능|서비스)/i

export type CollectedPage = { url: string; title: string; text: string }
export type CollectedFacts = { pages: CollectedPage[]; thin: boolean; notes: string[] }

async function get(url: string, ms = 8000): Promise<Response | null> {
  try {
    return await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(ms) })
  } catch {
    return null
  }
}

/** 'allowed' | 'disallowed' | 'unknown'. unknown 은 가지 않는다. */
export async function robotsVerdict(origin: string, path: string): Promise<'allowed' | 'disallowed' | 'unknown'> {
  const r = await get(`${origin}/robots.txt`, 5000)
  if (!r) return 'unknown'
  if (r.status === 404 || r.status === 410) return 'allowed'
  if (!r.ok) return 'unknown'
  return robotsDecision((await r.text()).slice(0, 100_000), path)
}

/** robots.txt 본문 → 판정(순수 함수, 셀프테스트 대상). */
export function robotsDecision(txt: string, path: string): 'allowed' | 'disallowed' {
  let applies = false
  const rules: string[] = []
  for (const line of txt.split(/\r?\n/)) {
    const m = line.split('#')[0].match(/^\s*([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const k = m[1].toLowerCase()
    const v = m[2].trim()
    if (k === 'user-agent') applies = v === '*' || /solutionarchive/i.test(v)
    else if (k === 'disallow' && applies && v) rules.push(v)
  }
  return rules.some((d) => d === '/' || path.startsWith(d)) ? 'disallowed' : 'allowed'
}

const ENT: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m] ?? m).replace(/\s+/g, ' ').trim().slice(0, 200)
  const body = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m] ?? m)
  const text = body.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).join('\n').slice(0, 6000)
  return { title, text }
}

function pickLinks(html: string, base: URL): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL
    try { u = new URL(m[1], base) } catch { continue }
    if (u.origin !== base.origin || u.pathname === base.pathname) continue
    if (WANT.test(u.pathname) || WANT.test(m[2].replace(/<[^>]+>/g, ''))) out.add(u.origin + u.pathname)
    if (out.size >= MAX_PAGES - 1) break
  }
  return [...out]
}

export async function collectCompany(rawUrl: string | null, oneLiner: string | null): Promise<CollectedFacts> {
  const notes: string[] = []
  const pages: CollectedPage[] = []
  const u = rawUrl ? normalizeCompanyUrl(rawUrl) : null
  if (!rawUrl) notes.push('회사 주소 없음 — 한 줄 설명만으로 진단')
  else if (!u) notes.push('주소를 확인할 수 없어(형식·내부 주소) 수집하지 않음')
  else {
    const v = await robotsVerdict(u.origin, u.pathname || '/')
    if (v !== 'allowed') notes.push(v === 'disallowed' ? 'robots.txt 가 수집을 막아 홈페이지를 읽지 않음' : 'robots.txt 를 확인하지 못해(판단 불가) 홈페이지를 읽지 않음')
    else {
      const home = await get(u.href)
      if (!home || !home.ok) notes.push(`홈페이지를 읽지 못함(${home ? `HTTP ${home.status}` : '연결 실패'})`)
      else {
        const html = (await home.text()).slice(0, MAX_BYTES)
        const h = htmlToText(html)
        if (h.text) pages.push({ url: u.href, ...h })
        for (const link of pickLinks(html, u)) {
          if ((await robotsVerdict(u.origin, new URL(link).pathname)) !== 'allowed') continue
          const r = await get(link)
          if (!r || !r.ok) continue
          const p = htmlToText((await r.text()).slice(0, MAX_BYTES))
          if (p.text) pages.push({ url: link, ...p })
        }
      }
    }
  }
  if (oneLiner) pages.push({ url: 'user:one_liner', title: '대표님이 적은 한 줄 설명', text: oneLiner.slice(0, 600) })
  const chars = pages.filter((p) => p.url !== 'user:one_liner').reduce((a, p) => a + p.text.length, 0)
  return { pages, thin: chars < 800, notes }
}
