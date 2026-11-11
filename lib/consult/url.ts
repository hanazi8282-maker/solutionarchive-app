// 회사 URL 검증 — 서버가 이 주소를 직접 fetch 한다(E0). 내부망·자격증명·비표준 포트는 거절한다(SSRF).
// ponytail: 문자열 검사만 한다(DNS 재바인딩은 못 막는다). Vercel 런타임에서 사설망에 닿지 않아 두고, 닿게 되면 resolve 후 IP 검사를 넣는다.
export function normalizeCompanyUrl(raw: string): URL | null {
  const s = (raw ?? '').trim()
  if (!s || s.length > 300) return null
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  if (u.port && u.port !== '80' && u.port !== '443') return null
  const h = u.hostname.toLowerCase()
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return null // IP 리터럴 전부 거절
  u.hash = ''
  return u
}
