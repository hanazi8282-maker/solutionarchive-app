// [v71cu S7 v2] 제품 발굴 공용 순수 함수 — 언급(mention)·스토어 순위(chart) 통로. 네트워크·DB 없음(registerCandidate 만 sb 를 받는다).
// 규칙: 일반 명사·평범한 단어·인프라 이름은 후보 0건. 후보→타깃 연결 수는 discovery_run_log 에 남긴다.
import { normKey } from '../../scripts/product-name-candidates.mjs'

export const MIN_RATINGS = 50, MIN_POSTS = 3, PER_AREA = 10, DAILY_MAX = 30, FAIL_STOP_RATIO = 0.8, FAIL_STOP_MIN = 10

// 분야 판정용 낱말(앱 이름·설명에 들어가면 +). 정밀도보다 '분야 밖 제외'가 목적.
export const SLUG_KEYWORDS = {
  payments_billing_accounting: ['invoice', 'accounting', 'bookkeeping', 'billing', 'payment', 'expense', '세금계산서', '장부', '정산', '회계', '請求書', '会計'],
  booking_scheduling_forms: ['booking', 'appointment', 'scheduling', 'reservation', 'forms', '예약', '일정', '予約'],
  marketing_automation: ['marketing', 'email campaign', 'social media', 'newsletter', 'automation', '마케팅', '문자 발송', 'マーケティング'],
  sales_crm: ['crm', 'sales pipeline', 'lead', 'customer management', '영업', '고객 관리', '명함', '営業', '顧客管理'],
}
export const CHART_GENRES = new Set(['Business', 'Productivity', 'Finance'])

// 일반 명사·평범한 단어·인프라/모델 이름 — 후보 제외. (지시 S7-1 ①: table, data, production, S3, OpenAI …)
const GENERIC_EN = ('table,data,production,database,server,cloud,api,app,apps,tool,tools,software,service,platform,system,code,file,files,page,pages,form,forms,list,lists,board,boards,' +
  'task,tasks,project,projects,team,teams,user,users,email,mail,chat,message,messages,note,notes,calendar,planner,tracker,report,reports,dashboard,editor,builder,manager,' +
  'free,paid,premium,basic,simple,smart,fast,easy,daily,weekly,monthly,online,mobile,desktop,web,browser,store,shop,market,sales,marketing,finance,money,bank,payment,payments,invoice,invoices,' +
  'booking,schedule,scheduler,meeting,meetings,call,calls,video,audio,photo,photos,design,docs,doc,sheet,sheets,slides,drive,storage,backup,sync,search,login,account,settings,support,help,' +
  'customer,customers,client,clients,lead,leads,deal,deals,contact,contacts,workflow,automation,template,templates,plugin,plugins,extension,extensions,widget,widgets,script,scripts,' +
  'staging,development,dev,prod,test,tests,debug,logs,log,queue,cache,proxy,docker,kubernetes,linux,windows,android,ios,mac,python,java,javascript,typescript,react,node,sql,json,html,css,' +
  's3,ec2,aws,gcp,azure,openai,chatgpt,gpt,gpt4,claude,gemini,llama,mistral,copilot,llm,ai,ml,saas,crm,erp,seo,ads,ad,pdf,csv,excel,word,google,apple,microsoft,amazon,meta,' +
  'github,gitlab,stripe,zapier,slack,discord,telegram,twitter,facebook,instagram,youtube,linkedin,reddit,hackernews,' +
  'one,two,three,first,second,next,last,new,old,best,good,better,great,real,main,other,another,same,every,some,any,all,more,most,less,just,only,also,still,very,really').split(',')
const GENERIC_KO = '앱,어플,서비스,프로그램,플랫폼,시스템,도구,툴,사이트,웹,데이터,서버,클라우드,파일,문서,양식,폼,목록,일정,예약,고객,회원,매출,정산,장부,회계,결제,마케팅,영업,메모,캘린더,채팅,메일,이메일,계정,설정,무료,유료,기능,업데이트'.split(',')
export const GENERIC = new Set([...GENERIC_EN, ...GENERIC_KO].map((w) => normKey(w)))

/** 일반 명사·평범한 단어·인프라 이름이면 true. 표면형(대소문자 포함)을 준다. */
export function isGenericName(surface) {
  const s = String(surface ?? '').trim()
  const k = normKey(s)
  if (!k || k.length < 2 || /^\d+$/.test(k)) return true
  if (GENERIC.has(k)) return true
  const words = s.split(/\s+/).filter(Boolean) // "Online Booking Form" 처럼 낱말 전부가 일반어면 일반어
  return words.length > 1 && words.every((w) => GENERIC.has(normKey(w)))
}

/** 글 속에서 소문자 평범한 단어로만 쓰였으면 제품 이름이 아니다 — 대문자·숫자·점·비라틴 글자로 쓰인 표면이 하나는 있어야 한다. */
export function looksLikeProductName(surfaces) {
  return [...surfaces].some((s) => !isGenericName(s) && (/[A-Z0-9.]/.test(s) || /[^\x00-\x7F]/.test(s)))
}

/** posts: [{id, raw_text}] → 후보 [{key, surface, surfaces, ids}] (서로 다른 글 ≥ minPosts, 일반어 제외). extract = lib/discovery/mention-loop.ts extractMentions. */
export function aggregateMentions(posts, extract, { minPosts = MIN_POSTS } = {}) {
  const by = new Map()
  for (const p of posts) {
    for (const m of extract(p.raw_text)) {
      const e = by.get(m.key) ?? { key: m.key, surfaces: new Set(), ids: new Set() }
      e.surfaces.add(m.surface); e.ids.add(p.id); by.set(m.key, e)
    }
  }
  const cands = []
  let rejectedGeneric = 0
  for (const e of by.values()) {
    if (e.ids.size < minPosts) continue
    if (!looksLikeProductName(e.surfaces)) { rejectedGeneric++; continue }
    cands.push({ key: e.key, surface: [...e.surfaces].find((s) => /[A-Z0-9.]/.test(s)) ?? [...e.surfaces][0], surfaces: [...e.surfaces], ids: [...e.ids] })
  }
  return { cands: cands.sort((a, b) => b.ids.length - a.ids.length), rejectedGeneric }
}

/** 앱 이름의 대표 이름: "Foo - Invoice Maker" / "Foo: CRM" → "Foo". */
export const headName = (n) => String(n ?? '').split(/\s+[-–—:|]\s+|:\s/)[0]

/** iTunes search 결과 중 이름 머리가 후보 키와 같은 앱 가운데 평가 수 최대. 없으면 null. 머리가 일반어면 null(이중 방어). */
export function matchStoreApp(key, results, { minRatings = MIN_RATINGS } = {}) {
  const hit = (results ?? []).filter((a) => a?.trackId && (a.userRatingCount ?? 0) >= minRatings && normKey(headName(a.trackName)) === key && !isGenericName(headName(a.trackName)))
  return hit.length ? hit.sort((a, b) => b.userRatingCount - a.userRatingCount)[0] : null
}

/** 이름+설명에서 분야 slug 하나. 이름 3점·설명 1점, 3점 이상·단독 1등만. 못 정하면 null. */
export function slugOf(name, description) {
  const n = String(name ?? '').toLowerCase(), d = String(description ?? '').toLowerCase().slice(0, 1500)
  const sc = Object.entries(SLUG_KEYWORDS).map(([slug, ks]) => [slug, ks.reduce((s, k) => s + (n.includes(k) ? 3 : d.includes(k) ? 1 : 0), 0)]).sort((a, b) => b[1] - a[1])
  return sc[0][1] >= 3 && sc[0][1] > sc[1][1] ? sc[0][0] : null
}

/** 차트 항목({id,name,country}) + lookup 결과 맵 → 후보. 장르·평가 수·분야·일반어 거름. known(등록 앱 ID)에 없는 것만. */
export function pickChart(entries, lookups, known) {
  const seen = new Set(known), cands = []
  let rejectedGeneric = 0, outOfArea = 0
  for (const e of entries) {
    const r = lookups.get(String(e.id))
    if (!r || seen.has(String(e.id)) || !CHART_GENRES.has(r.primaryGenreName) || (r.userRatingCount ?? 0) < MIN_RATINGS) continue
    if (isGenericName(headName(r.trackName))) { rejectedGeneric++; continue }
    const slug = slugOf(r.trackName, r.description)
    if (!slug) { outOfArea++; continue }
    seen.add(String(e.id))
    cands.push({ slug, cc: e.country, id: String(e.id), name: r.trackName, url: r.sellerUrl ?? r.trackViewUrl, ratings: r.userRatingCount })
  }
  return { cands, rejectedGeneric, outOfArea }
}

/** 하루 상한: 분야당 PER_AREA, 전체 DAILY_MAX. */
export function capPerArea(cands, perArea = PER_AREA, max = DAILY_MAX) {
  const n = {}, out = []
  for (const c of cands) { if (out.length >= max || (n[c.slug] ?? 0) >= perArea) continue; n[c.slug] = (n[c.slug] ?? 0) + 1; out.push(c) }
  return out
}

/** 시험 실패율 ≥ 80% (10건 이상 시험했을 때) → 그날 중단. */
export const shouldStop = (probed, failed) => probed >= FAIL_STOP_MIN && failed / probed >= FAIL_STOP_RATIO

/** 후보 1건 → 프로젝트(재사용)·discovery_candidates·앱스토어 kr·us 임시 타깃·분야 링크. 전부 성공이면 true. extra: 원천별 열(post_count 등). */
export async function registerCandidate(sb, m, { origin, batch, why, extra = {} }) {
  const pitch = `${origin}-discovery ${m.slug} — ${m.name}`
  const { data: old } = await sb.from('analysis_projects').select('id').eq('product_elevator_pitch', pitch).limit(1)
  const { data: proj, error: pe } = old?.length ? { data: old[0], error: null } : await sb.from('analysis_projects').insert({ competitor_url: m.url, product_elevator_pitch: pitch, purpose: 'product_fit', status: 'collecting', mode: 'forward' }).select('id').single()
  if (pe) { console.log('proj', pe.message); return false }
  const { error: ce } = await sb.from('discovery_candidates').insert({ kind: 'saas', name: m.name, homepage_url: m.url, why, probe_source_key: 'appstore', probe_ref: `${m.cc}:${m.id}`, probe_hits: m.ratings, probe_at: new Date().toISOString(), verdict: 'accepted', verdict_reason: '앱스토어 시험: 이름 일치 · 평가 수 50+ · 미등록', project_id: proj.id, origin, last_seen_at: new Date().toISOString(), ...extra })
  if (ce) { console.log('cand', ce.message); return false }
  const tg = ['kr', 'us'].map((cc) => ({ project_id: proj.id, source_key: 'appstore', product_ref: `${cc}:${m.id}`, label: `${m.slug}:${m.name}`, area: m.slug, status: 'active', onboard_batch: batch, layer: 'app' }))
  const { data: ins, error: te } = await sb.from('review_targets').insert(tg).select('id')
  if (te) { console.log('target', te.message); return false }
  await sb.from('target_area_links').upsert(ins.map((t) => ({ target_id: t.id, area_slug: m.slug, basis: `${origin}-discovery`, rule_ver: 'sd-v2' })), { onConflict: 'target_id,area_slug', ignoreDuplicates: true })
  return true
}
