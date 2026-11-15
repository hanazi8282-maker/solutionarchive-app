// 지반 데이터 적재 (v71ce). 멱등(upsert on conflict) + 체크포인트. 원문 전문은 넣지 않는다.
// 사용: node scripts/ingest-ground.mjs [source ...]   (생략하면 전부)
// 입력 폴더: GROUND_DIR (기본 C:/Users/DCU/sa-private/ground). 이 폴더·출력은 공개 리포에 커밋하지 않는다.
import fs from 'fs'; import zlib from 'zlib'; import path from 'path';
import { createClient } from '@supabase/supabase-js';

const G = process.env.GROUND_DIR || 'C:/Users/DCU/sa-private/ground';
const OUT = 'C:/Users/DCU/sa-private/ingest-out'; fs.mkdirSync(OUT, { recursive: true });
const CP = path.join(OUT, 'checkpoint.json');
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- 파서/유틸 ----------
function csv(text, delim = ',') {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f.replace(/\r$/, '')); rows.push(row); }
  const [h, ...b] = rows; return b.filter(r => r.length > 1 || r[0]).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const readCsv = (p, d) => csv(fs.readFileSync(G + '/' + p, 'utf8').replace(/^\uFEFF/, ''), d);
const jsonl = p => zlib.gunzipSync(fs.readFileSync(G + '/' + p)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const rj = p => JSON.parse(fs.readFileSync(G + '/' + p, 'utf8').replace(/^\uFEFF/, ''));
const num = v => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const int = v => { const n = num(v); return n == null ? null : Math.trunc(n); };
const str = v => (v == null || v === '' ? null : String(v));
const clip = (v, n = 280) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);
const dom = u => { if (!u) return null; try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase() || null; } catch { return null; } };
const norm = s => (s ? String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '') || null : null);
const date = v => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const drop = (o, keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };
const j = v => (v === undefined ? null : v);
const bool = v => (v === true || v === 'true' || v === 'TRUE' ? true : v === false || v === 'false' || v === 'FALSE' ? false : null);
const BIG = ['full_text', 'full_text_chars', 'truncated_cap', 'fetched_at', 'http_status'];

const cp = fs.existsSync(CP) ? JSON.parse(fs.readFileSync(CP, 'utf8')) : {};
const saveCp = () => fs.writeFileSync(CP, JSON.stringify(cp));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function upsertBatch(table, rows, onConflict, ignore) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { error } = await sb.from(table).upsert(rows, { onConflict, ignoreDuplicates: !!ignore });
    if (!error) return { ok: rows.length, fail: [] };
    if (attempt === 5 || rows.length === 1) break;
    await sleep(500 * attempt);
    if (rows.length > 1 && attempt >= 2) { // 배치 쪼개기
      const h = Math.ceil(rows.length / 2); const a = await upsertBatch(table, rows.slice(0, h), onConflict, ignore); const b = await upsertBatch(table, rows.slice(h), onConflict, ignore);
      return { ok: a.ok + b.ok, fail: [...a.fail, ...b.fail] };
    }
  }
  const { error } = await sb.from(table).upsert(rows.slice(0, 1), { onConflict, ignoreDuplicates: !!ignore });
  return { ok: 0, fail: rows.map(r => ({ key: r.source_key, reason: (error?.message || 'unknown').slice(0, 200) })) };
}

async function load(name, table, rows, onConflict, { batch = 200, ignore = false } = {}) {
  const start = cp[name]?.done || 0; let ok = cp[name]?.ok || 0; const fails = cp[name]?.fails || [];
  const t0 = Date.now();
  for (let i = start; i < rows.length; i += batch) {
    const r = await upsertBatch(table, rows.slice(i, i + batch), onConflict, ignore);
    ok += r.ok; fails.push(...r.fail); cp[name] = { done: Math.min(i + batch, rows.length), ok, fails, total: rows.length }; saveCp();
  }
  const rec = { name, table, source_rows: rows.length, loaded: ok, failed: fails.length, secs: Math.round((Date.now() - t0) / 1000) };
  if (fails.length) fs.writeFileSync(path.join(OUT, `failures_${name}.json`), JSON.stringify(fails, null, 1));
  fs.appendFileSync(path.join(OUT, 'counts.jsonl'), JSON.stringify(rec) + '\n');
  console.log(JSON.stringify(rec)); return rec;
}

// ---------- 소스별 매퍼 ----------
const S = {
  async failure_unified() {
    const rows = readCsv('unified_failures_3218.csv').map((r, i) => ({
      source: 'unified:' + r.source, source_key: (r.url || r.evidence_url || r.company) + '#' + i, company: str(r.company), company_norm: norm(r.company), domain_norm: dom(r.url && !/ideaproof|loot-drop|startups\.rip|cbinsights|failory|vcbacked/.test(r.url) ? r.url : null),
      url: str(r.url), country: str(r.country), category: str(r.category), founded_year: int(r.founded_year), closed_year: int(r.closed_year), funding_usd: num(r.funding_usd),
      cause_primary: str(r.cause_primary), cause_tags: str(r.cause_tags), cause_source_type: str(r.cause_source_type), evidence_url: str(r.evidence_url), lesson_one_line: clip(r.lesson_one_line, 400), extra: {} }));
    return load('failure_unified', 'failure_ledger', rows, 'source,source_key');
  },
  async failure_vcbacked() {
    const rows = readCsv('vcbacked/vcbacked_graveyard_full_2288.csv').map(r => ({
      source: 'vcbacked', source_key: r.id, company: str(r.name), company_norm: norm(r.name), domain_norm: dom(r.website), url: str(r.website), country: str(r.location?.split(',').pop()?.trim()),
      category: clip(r.industries, 200), funding_usd: num(r.raised), cause_primary: null, lesson_one_line: clip(r.description, 400),
      extra: { industries: r.industries, location: r.location, founders: r.founders, investors: r.investors, last_round_type: r.lastRoundType, last_round_date: r.lastRoundDate } }));
    return load('failure_vcbacked', 'failure_ledger', rows, 'source,source_key');
  },
  async ss_stories() {
    const rows = jsonl('starterstory/starterstory_stories_3314.jsonl.gz').map(r => ({
      source: 'ss_story', source_key: r.slug || r.url, title: str(r.title), category: str(r.category), summary: clip(r.qa?.[0]?.a ?? r.qa?.[0]?.answer ?? ''), website: str(r.website), domain_norm: dom(r.website), location: str(r.location),
      revenue_mo: num(r.revenue_mo), founders_count: int(r.founders_count), started: str(r.started), published: date(r.date), tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      metrics: { employees: r.employees, market_size: r.market_size_num, starting_costs: r.starting_costs_num, gross_margin: r.gross_margin, time_to_build: r.time_to_build, growth_channels: r.growth_channels, business_model: r.business_model, mentions_saas: r.mentions_saas, qa_count: r.qa_count },
      extra: { company: r.company, founder_name: r.founder_name, url: r.url, idea_url: r.idea_url, idea_title: r.idea_title } }));
    return load('ss_stories', 'idea_bank', rows, 'source,source_key', { batch: 100 });
  },
  async ss_ideas() {
    const rows = jsonl('starterstory/starterstory_ideas_5949.jsonl.gz').map(r => ({
      source_key: r.slug || r.url, idea_slug: r.idea_slug, page_type: r.page_type, title: str(r.title), category: typeof r.category === 'object' ? j(r.category?.name ?? JSON.stringify(r.category)) : str(r.category), intro: clip(r.intro, 600),
      pros: j(r.pros), cons: j(r.cons), stats: drop({ stats: r.stats, market_size_num: r.market_size_num, avg_monthly_revenue_num: r.avg_monthly_revenue_num, avg_startup_costs_num: r.avg_startup_costs_num, score: r.score, cost_low: r.cost_low, cost_high: r.cost_high, profitable_pct: r.profitable_pct, gross_margin_pct: r.gross_margin_pct }, []),
      extra: { url: r.url, idea_name: r.idea_name, date: r.date, meta_description: clip(r.meta_description, 300), sibling_links: r.sibling_links, sections: Array.isArray(r.sections) ? r.sections.map(s => s?.title ?? s?.heading ?? null) : null } }));
    return load('ss_ideas', 'idea_facets', rows, 'source_key', { batch: 100 });
  },
  async ss_breakdowns() {
    const rows = jsonl('starterstory/starterstory_breakdowns_1520.jsonl.gz').map(r => ({
      source_key: r.slug || r.url, breakdown_slug: r.breakdown_slug, business_name: str(r.business_name), idea_name: str(r.idea_name), category: typeof r.category === 'object' ? null : str(r.category), tools_count: int(r.tools_count),
      tools: r.tools ?? [], intro: clip(r.intro, 600), extra: { url: r.url, page_type: r.page_type, tool_categories: r.tool_categories, tools_with_comment: r.tools_with_comment, date: r.date } }));
    return load('ss_breakdowns', 'idea_bank_tools', rows, 'source_key', { batch: 100 });
  },
  async ss_businesses() {
    const rows = jsonl('starterstory/starterstory_businesses_1343.jsonl.gz').map(r => {
      const sp = r.subpages ? Object.fromEntries(Object.entries(r.subpages).map(([k, v]) => [k, k === 'sources' ? { n_sources: v?.n_sources, sources_summary: v?.sources_summary } : drop(v || {}, ['url', 'fetched_at'])])) : {};
      return { source_key: r.slug || r.url, name: str(r.name), category: str(r.category), website: str(r.website), domain_norm: dom(r.website), one_liner: clip(r.one_liner, 400), founded_year: int(r.founded_year),
        est_monthly_revenue_num: num(r.est_monthly_revenue_num), revenue_sourced: bool(r.revenue_sourced), n_sources: int(r.n_sources), monetization_models: j(r.monetization_models), growth_channels: j(r.growth_channels), tools: j(r.tools), founders: j(r.founders), key_facts: j(r.key_facts), subpages: sp,
        extra: { url: r.url, sources_summary: r.sources_summary, revenue_latest_run_rate_num: r.revenue_latest_run_rate_num, revenue_latest_run_rate_date: r.revenue_latest_run_rate_date, customers: r.customers } };
    });
    return load('ss_businesses', 'ss_businesses', rows, 'source_key', { batch: 25 });
  },
  async ss_tools() {
    const rows = jsonl('starterstory/starterstory_tools_281.jsonl.gz').map(r => ({
      source_key: r.slug, tool_name: str(r.tool_name), description: clip(r.description, 400), category: str(r.category), used_by_count: int(r.used_by_count), mentions: j(r.mentions), alternatives: j(r.alternatives),
      businesses_using_count: Array.isArray(r.businesses_using) ? r.businesses_using.length : null, extra: { url: r.url, page_urls: r.page_urls, premium_gated: r.premium_gated, category_source: r.category_source } }));
    return load('ss_tools', 'ss_tools', rows, 'source_key');
  },
  async ss_lists() {
    const rows = jsonl('starterstory/starterstory_data_lists_40.jsonl.gz').map(r => ({
      source_key: r.slug, list_name: str(r.list_name), n_businesses: int(r.n_businesses), median_revenue_num: num(r.median_revenue_num), growth_channels: j(r.growth_channels), business_models: j(r.business_models), revenue_buckets: j(r.revenue_buckets), entries: j(r.business_entries),
      extra: { url: r.url, added_last_30d: r.added_last_30d, founder_reported_share_pct: r.founder_reported_share_pct, middle_half_range_text: r.middle_half_range_text, gated_note: r.gated_note } }));
    return load('ss_lists', 'ss_lists', rows, 'source_key');
  },
  async ss_legacy() {
    const rows = jsonl('starterstory/starterstory_legacy_breakdowns_631.jsonl.gz').map(r => ({
      source_key: r.slug, title: str(r.title), published: date(r.date), website: str(r.website_url || r.website), domain_norm: dom(r.website_url || r.website), monthly_revenue_num: num(r.monthly_revenue_num), starting_costs_num: j(r.starting_costs_num), days_to_build: int(r.days_to_build),
      founders_count: int(r.founders_count), monthly_traffic_num: j(r.monthly_traffic_num), profitable: bool(r.profitable), year_started: int(r.year_started), customer_type: str(r.customer_type), is_estimated: bool(r.is_estimated),
      tools: j(r.tools), section_keys: j(r.section_keys), faq: j(r.faq), sources_count: int(r.sources_count), extra: { url: r.url, estimate_note: r.estimate_note, revenue_per_visitor_num: r.revenue_per_visitor_num, section_order: r.section_order } }));
    return load('ss_legacy', 'ss_legacy', rows, 'source_key', { batch: 50 });
  },
  async ideaproof_ideas() {
    const rows = readCsv('ideaproof/ideaproof_startup_ideas_from_js.csv').map(r => ({
      source: 'ideaproof_idea', source_key: r.slug, title: str(r.title), category: str(r.category), summary: clip(r.description, 400), ai_generated: true, evidence_forbidden: true, quality_tier: 'D',
      metrics: { industry: r.industry, marketSize: r.marketSize, competition: r.competition, viabilityScore: num(r.viabilityScore), monetization: r.monetization, launchDifficulty: r.launchDifficulty, estimatedStartupCost: r.estimatedStartupCost, budget: r.budget, isAI: r.isAI, isOnline: r.isOnline, isSoloFounder: r.isSoloFounder, dataQuality: r.dataQuality },
      extra: { note: 'AI-generated hypothesis; not evidence. CC BY 4.0 IdeaProof (https://ideaproof.io)' } }));
    return load('ideaproof_ideas', 'idea_bank', rows, 'source,source_key');
  },
  async ideaproof_ref() {
    const out = [];
    for (const [kind, file, key] of [['failure_csv', 'startup-failures.csv', 'slug'], ['failure_full', 'ideaproof_failures_full_from_js.csv', 'slug'], ['base_rates', 'failure-base-rates.csv', 'id'], ['benchmarks', 'fundraising-benchmarks.csv', 'slug'], ['glossary', 'glossary.csv', 'slug']]) {
      const rows = readCsv('ideaproof/' + file);
      rows.forEach((r, i) => { const d = drop(r, ['fullAnalysis', 'lessonsDetailed', 'llmSummary', 'faqs', 'timeline', 'rows', 'definition', 'example', 'related_links']); for (const k in d) if (typeof d[k] === 'string' && d[k].length > 500) d[k] = d[k].slice(0, 300);
        out.push({ kind, source_key: (r[key] || r.name || 'row') + '#' + i, data: d }); });
    }
    return load('ideaproof_ref', 'ideaproof_ref', out, 'kind,source_key');
  },
  async indiehackers() {
    const rows = readCsv('indiehackers/ideas_list_2026-11-01.psv', '|').map(r => ({
      source: 'indiehackers_list', source_key: r.id, title: str(r.name), summary: clip(r.description, 300), style_reference_only: true, tags: r.tags ? [r.tags] : [], metrics: { mrr_text: r.mrr }, extra: {} }));
    return load('indiehackers', 'idea_bank', rows, 'source,source_key');
  },
  async hiddenrich() {
    const cat = rj('hiddenrich/thr_catalog_full.json').rows, pub = rj('hiddenrich/idea_db_catalog.json'), cs = rj('hiddenrich/thr_casestudies_part1.json').cases;
    const m = (r, src) => ({ source: src, source_key: String(r.id), title: str(r.service), category: str(r.category), summary: clip(r.oneLinerEn || r.oneLiner || r.shortDescription, 300), website: str(r.homepageUrl), domain_norm: dom(r.domain || r.homepageUrl), style_reference_only: true,
      tags: [...(r.categoryTagsEn || [])].map(String), metrics: { score: r.score, country: r.country, status: r.status, platform: r.platform, categoryGroup: r.categoryGroup, minimumPriceValue: r.minimumPriceValue, estimatedRevenueValue: r.estimatedRevenueValue, monthlyVisitors: r.monthlyVisitors, competitionLevel: r.competitionLevel, entryDifficulty: r.entryDifficulty, revenueModel: r.revenueModel, publishedAt: r.publishedAt }, extra: {} });
    const a = await load('hiddenrich_catalog', 'idea_bank', cat.map(r => m(r, 'hiddenrich')), 'source,source_key');
    const b = await load('hiddenrich_public', 'idea_bank', pub.map(r => m(r, 'hiddenrich')), 'source,source_key', { ignore: true });
    const c = await load('hiddenrich_cases', 'idea_bank', cs.map(r => ({ source: 'hiddenrich_case', source_key: r.slug, title: str(r.title), summary: clip(r.meta_description, 300), style_reference_only: true, tags: Array.isArray(r.tags) ? r.tags.map(x => String(x?.name ?? x)) : [], published: date(r.date), extra: { url: r.url, headings: r.headings, keywords: r.keywords }, metrics: {} })), 'source,source_key');
    return [a, b, c];
  },
};

const want = process.argv.slice(2); const order = Object.keys(S).filter(k => !want.length || want.includes(k));
for (const k of order) { try { await S[k](); } catch (e) { console.log('ERR', k, String(e.message).slice(0, 300)); fs.appendFileSync(path.join(OUT, 'counts.jsonl'), JSON.stringify({ name: k, error: String(e.message).slice(0, 300) }) + '\n'); } }
