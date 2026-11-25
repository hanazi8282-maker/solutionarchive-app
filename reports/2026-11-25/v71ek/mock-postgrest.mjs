// 메모리 PostgREST 흉내 — v71ek 동치 검사용. 네트워크는 127.0.0.1 뿐, 데이터는 전부 합성.
//
// ⚠️ 여기 구현은 실제 PostgREST 를 "이렇게 동작한다고 가정"한 것이다. 증명이 아니다(NOTES.md §가정):
//   P1 임베드 alias:table!left|inner(cols) — verdicts.input_id(PK) FK 라 1:1(객체 또는 null)
//   P2 alias.col=op.v · alias.or=(…) 은 임베드 행을 거른다. !inner 는 임베드가 없으면 부모도 뺀다
//   P3 alias=is.null 은 (임베드 필터 적용 뒤) 비어 있는 부모만 남긴다
//   P4 imatch = 대소문자 무시 정규식(여기선 JS RegExp 'i' 로 흉내 — Postgres 엔진이 아니다)
//   P5 Prefer: count=exact → Content-Range 의 / 뒤가 필터 전체 행 수
//   P6 응답 1회 최대 1,000행
import http from 'node:http'

const MAX_ROWS = 1000

/** 최상위 쉼표로 자른다(괄호·따옴표 안은 자르지 않는다). */
function splitTop(s) {
  const out = []
  let depth = 0, quoted = false, cur = ''
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    }
    cur += ch
  }
  if (cur !== '') out.push(cur)
  return out.map((x) => x.trim())
}

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

const unquote = (v) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v)
const isTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
const cmpVal = (a, b) => (isTime(a) && isTime(b) ? Date.parse(a) - Date.parse(b) : typeof a === 'number' ? a - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
const likeRe = (pat, flags) => new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '*' : '\\' + c)).replace(/[*%]/g, '[\\s\\S]*') + '$', flags)

function predicate(col, expr, columns) {
  if (columns && !columns.has(col)) throw new ApiError(400, '42703', `column ${col} does not exist`)
  let negate = false
  if (expr.startsWith('not.')) { negate = true; expr = expr.slice(4) }
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot)
  const arg = expr.slice(dot + 1)
  let f
  if (op === 'is') f = (v) => (arg === 'null' ? v == null : v === (arg === 'true'))
  else if (op === 'eq') f = (v) => v != null && String(v) === unquote(arg)
  else if (op === 'neq') f = (v) => v != null && String(v) !== unquote(arg)
  else if (op === 'gt') f = (v) => v != null && cmpVal(v, unquote(arg)) > 0
  else if (op === 'gte') f = (v) => v != null && cmpVal(v, unquote(arg)) >= 0
  else if (op === 'lt') f = (v) => v != null && cmpVal(v, unquote(arg)) < 0
  else if (op === 'lte') f = (v) => v != null && cmpVal(v, unquote(arg)) <= 0
  else if (op === 'in') { const set = new Set(splitTop(arg.slice(1, -1)).map(unquote)); f = (v) => v != null && set.has(String(v)) }
  else if (op === 'like' || op === 'ilike') { const re = likeRe(unquote(arg), op === 'ilike' ? 'i' : ''); f = (v) => v != null && re.test(String(v)) }
  else if (op === 'match' || op === 'imatch') { const re = new RegExp(arg, op === 'imatch' ? 'i' : ''); f = (v) => v != null && re.test(String(v)) }
  else throw new ApiError(400, 'PGRST100', `unknown operator ${op}`)
  // SQL 3값: NOT (NULL op x) 는 참이 아니다(is 제외).
  return (row) => { const v = row[col]; if (negate) return op !== 'is' && v == null ? false : !f(v); return f(v) }
}

/** or=(a.eq.x,and(b.is.null,c.eq.y)) */
function logic(kind, body, columns) {
  const parts = splitTop(body.slice(1, -1)).map((p) => {
    if (p.startsWith('and(')) return logic('and', p.slice(3), columns)
    if (p.startsWith('or(')) return logic('or', p.slice(2), columns)
    const dot = p.indexOf('.')
    return predicate(p.slice(0, dot), p.slice(dot + 1), columns)
  })
  return kind === 'or' ? (r) => parts.some((f) => f(r)) : (r) => parts.every((f) => f(r))
}

export async function startMock(tables, opts = {}) {
  const stats = { requests: 0, bytes: 0, byTable: {}, log: [] }
  const writes = []
  const columnsOf = (t) => {
    const set = new Set()
    for (const r of tables[t] ?? []) for (const k of Object.keys(r)) set.add(k)
    for (const k of opts.dropColumns?.[t] ?? []) set.delete(k)
    return set.size ? set : null
  }
  const verdictIndex = () => new Map((tables.review_relevance_verdicts ?? []).map((v) => [v.input_id, v]))

  function run(table, params, headers) {
    if (!(table in tables)) throw new ApiError(404, 'PGRST205', `Could not find the table ${table}`)
    const columns = columnsOf(table)
    const items = splitTop(params.get('select') ?? '*')
    const cols = [], embeds = []
    for (const it of items) {
      const m = /^(?:(\w+):)?(\w+)(?:!(left|inner))?\((.*)\)$/s.exec(it)
      if (m) {
        if (opts.noEmbed || !(table === 'analysis_inputs' && m[2] === 'review_relevance_verdicts')) throw new ApiError(400, 'PGRST200', `no relationship ${table} - ${m[2]}`)
        embeds.push({ alias: m[1] ?? m[2], table: m[2], inner: m[3] === 'inner', cols: splitTop(m[4]), filters: [], isNull: null })
      } else cols.push(it)
    }
    if (columns) for (const c of cols) if (c !== '*' && !columns.has(c)) throw new ApiError(400, '42703', `column ${table}.${c} does not exist`)
    const filters = []
    for (const [key, val] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
      if (opts.noImatch && val.startsWith('imatch.')) throw new ApiError(500, '57014', 'canceling statement due to statement timeout')
      const emb = embeds.find((e) => key === e.alias || key.startsWith(e.alias + '.'))
      if (emb) {
        const ec = columnsOf(emb.table)
        if (key === emb.alias) emb.isNull = val === 'is.null'
        else {
          const sub = key.slice(emb.alias.length + 1)
          emb.filters.push(sub === 'or' ? logic('or', val, ec) : predicate(sub, val, ec))
        }
      } else if (key === 'or') filters.push(logic('or', val, columns))
      else filters.push(predicate(key, val, columns))
    }
    let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    let joined = rows.map((r) => ({ r, e: {} }))
    if (embeds.length) {
      const idx = verdictIndex()
      for (const e of embeds) {
        joined = joined.flatMap((j) => {
          let hit = idx.get(j.r.id) ?? null
          if (hit && !e.filters.every((f) => f(hit))) hit = null
          if (e.isNull === true && hit) return []
          if (e.isNull === false && !hit) return []
          if (e.inner && !hit) return []
          j.e[e.alias] = hit ? Object.fromEntries(e.cols.map((c) => [c, hit[c] ?? null])) : null
          return [j]
        })
      }
    }
    const order = params.get('order')
    if (order) {
      const keys = order.split(',').map((o) => { const [c, dir, nulls] = o.split('.'); return { c, desc: dir === 'desc', nulls } })
      joined.sort((a, b) => {
        for (const k of keys) {
          const x = a.r[k.c], y = b.r[k.c]
          if (x == null || y == null) {
            if (x == null && y == null) continue
            const first = k.nulls ? k.nulls === 'nullsfirst' : k.desc
            return (x == null) === first ? -1 : 1
          }
          const d = cmpVal(x, y)
          if (d) return k.desc ? -d : d
        }
        return 0
      })
    }
    const total = joined.length
    const offset = Number(params.get('offset') ?? 0)
    const limit = Math.min(Number(params.get('limit') ?? MAX_ROWS), MAX_ROWS)
    const page = joined.slice(offset, offset + limit).map(({ r, e }) => {
      const base = cols.includes('*') ? Object.fromEntries([...(columns ?? [])].map((c) => [c, r[c] ?? null])) : Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))
      return { ...base, ...e }
    })
    const counted = (headers.prefer ?? '').includes('count=exact')
    return { page, range: `${page.length ? `${offset}-${offset + page.length - 1}` : '*'}/${counted ? total : '*'}` }
  }

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => { body += d })
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const table = url.pathname.replace(/^\/rest\/v1\//, '')
      const send = (status, payload, extra = {}) => {
        const text = req.method === 'HEAD' || payload === undefined ? '' : JSON.stringify(payload)
        const n = Buffer.byteLength(text)
        stats.requests++
        stats.bytes += n
        const t = (stats.byTable[table] ??= { requests: 0, bytes: 0, rows: 0 })
        t.requests++; t.bytes += n; t.rows += Array.isArray(payload) ? payload.length : 0
        stats.log.push({ method: req.method, table, query: decodeURIComponent(url.search), status, bytes: n })
        res.writeHead(status, { 'content-type': 'application/json', ...extra })
        res.end(text)
      }
      try {
        const prefer = req.headers.prefer ?? ''
        if (req.method === 'GET' || req.method === 'HEAD') {
          const { page, range } = run(table, url.searchParams, req.headers)
          return send(200, page, { 'content-range': range })
        }
        const payload = body ? JSON.parse(body) : null
        writes.push({ method: req.method, table, query: decodeURIComponent(url.search), payload })
        tables[table] ??= []
        if (req.method === 'POST') {
          const list = Array.isArray(payload) ? payload : [payload]
          const key = url.searchParams.get('on_conflict')?.split(',')
          const out = []
          for (const r of list) {
            const i = key ? tables[table].findIndex((x) => key.every((k) => x[k] === r[k])) : -1
            if (i < 0) { const row = { id: `gen-${table}-${tables[table].length}`, ...r }; tables[table].push(row); out.push(row) }
            else if (!prefer.includes('ignore-duplicates')) { tables[table][i] = { ...tables[table][i], ...r }; out.push(tables[table][i]) }
          }
          const wantsOne = (req.headers.accept ?? '').includes('vnd.pgrst.object')
          return send(201, prefer.includes('return=representation') ? (wantsOne ? out[0] ?? null : out) : undefined)
        }
        if (req.method === 'PATCH') {
          const fs_ = []
          for (const [k, v] of url.searchParams) if (k !== 'select') fs_.push(predicate(k, v, null))
          const hit = tables[table].filter((r) => fs_.every((f) => f(r)))
          for (const r of hit) Object.assign(r, payload)
          return send(200, prefer.includes('return=representation') ? hit : undefined)
        }
        return send(405, { message: 'no' })
      } catch (e) {
        send(e.status ?? 500, { code: e.code ?? 'XX000', message: e.message })
      }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stats, writes, tables,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r) }),
  }
}
