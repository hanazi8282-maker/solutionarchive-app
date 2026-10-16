#!/usr/bin/env node
// 인스타 카드뉴스 JPEG 생성기 (v71w 2).
//
//   node scripts/ig-card/render.mjs --spec <ig-style-spec.json> --content <card.json> --out <리포 밖 폴더> [--fonts noto|system]
//
// 레이아웃 수치는 전부 스타일 스펙(defaults + override)에서 읽는다. 스펙에 없는 값은
// "관찰 불가" 경고를 매니페스트·로그에 남기고 아래 get() 의 기본값을 쓴다 — 스펙에 그 키를
// 채우면 코드 수정 없이 반영된다(키 이름은 경고 문구에 그대로 찍힌다).
// 렌더: sharp(libvips) + SVG(librsvg). 글자 폭은 같은 Pango 로 실측해 어절 경계에서만 줄바꿈한다.
// 출력 폴더는 git 리포 안이면 거부한다(공개 리포 커밋 방지).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const JPEG_QUALITY = 90;
const MIN_FONT_PX = 30; // 1080 폭 기준. 폰 폭 390px 환산 약 11px — 이보다 작으면 실패.
const CANVAS = { '1:1': [1080, 1080], '4:5': [1080, 1350] };
const FONT_SETS = {
  noto: { sans: 'Noto Sans KR', serif: 'Noto Serif KR', files: ['NotoSansKR', 'NotoSerifKR'] }, // SIL OFL
  system: { sans: 'Malgun Gothic', serif: 'Batang' }, // Windows 번들 — 이미지 렌더 라이선스 확인 필요
};

// ── 스펙 읽기 ───────────────────────────────────────────────────────
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => {
  if (!isObj(a) || !isObj(b)) return b;
  const r = { ...a };
  for (const k of Object.keys(b)) r[k] = deepMerge(a[k], b[k]);
  return r;
};
/** defaults 위에 override(null 아닌 값만)를 덮는다 — 스펙 문서의 우선순위 규칙. */
export function effectiveSpec(spec) {
  let d = structuredClone(spec.defaults ?? {});
  for (const [k, v] of Object.entries(spec.override ?? {})) if (!k.startsWith('_') && v != null) d[k] = deepMerge(d[k], v);
  return d;
}
const mid = (v) => (Array.isArray(v) ? (v[0] + v[v.length - 1]) / 2 : v);
const pctNums = (s, re) => (typeof s === 'string' ? s.match(re)?.slice(1).map(Number) : undefined);

function makeGet(d, warnings) {
  return (key, fallback) => {
    const v = key.split('.').reduce((o, k) => o?.[k], d);
    if (v !== undefined && v !== null) return v;
    const msg = `관찰 불가: ${key} — 스펙에 값이 없어 기본값 ${JSON.stringify(fallback)} 사용`;
    if (!warnings.includes(msg)) {
      warnings.push(msg);
      console.log(`[ig-card] ${msg}`);
    }
    return fallback;
  };
}

// ── 글자 폭 실측 · 줄바꿈 ──────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const widthCache = new Map();
export async function measure(text, f) {
  const key = `${f.family}|${f.weight}|${f.size}|${text}`;
  if (!widthCache.has(key)) {
    const markup = `<span font_family="${esc(f.family)}" font_weight="${f.weight}" size="${Math.round(f.size * 1024)}">${esc(text)}</span>`;
    const { info } = await sharp({ text: { text: markup, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
    widthCache.set(key, info.width);
  }
  return widthCache.get(key);
}

/** 입력의 \n 을 먼저 지키고, 넘치면 어절(공백) 경계에서만 끊는다. 어절 하나가 폭을 넘으면 에러. */
export async function wrapText(text, f, maxW, errors) {
  const out = [];
  for (const manual of String(text).split('\n')) {
    const words = manual.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (!cur || (await measure(t, f)) <= maxW) cur = t;
      else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  for (const l of out) if (l && (await measure(l, f)) > maxW) errors.push(`어절 하나가 줄 폭(${Math.round(maxW)}px)을 넘음: "${l}"`);
  return out;
}

// ── 출력 폴더 가드 ──────────────────────────────────────────────────
export function assertOutsideRepo(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) throw new Error(`출력 폴더가 git 리포(${cur}) 안이다 — 공개 리포 커밋 방지로 거부: ${dir}`);
    const up = path.dirname(cur);
    if (up === cur) return;
    cur = up;
  }
}

function notoInstalled() {
  const dirs = [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts')];
  const names = dirs.flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  return FONT_SETS.noto.files.every((p) => names.some((n) => n.startsWith(p)));
}

// ── 그리기 조각 ─────────────────────────────────────────────────────
const textEl = (x, baseline, s, f, fill, anchor = 'start') =>
  `<text x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${esc(f.family)}" font-size="${f.size}" font-weight="${f.weight}" fill="${fill}" text-anchor="${anchor}" xml:space="preserve">${esc(s)}</text>`;
// 줄 상자(높이 lh) 안에서 글자를 세로 가운데 두는 기준선. ponytail: 0.35em 근사, 서체별 ascent 실측은 필요해지면.
const baselineIn = (top, lh, size) => top + lh / 2 + size * 0.35;

function iconSvg(kind, cx, cy, d, color) {
  const r = d / 2, s = r * 0.42, sw = Math.max(2, d * 0.035);
  const circle = `<circle cx="${cx}" cy="${cy}" r="${r - sw / 2}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  const tri = (x0, dir) => `<polygon points="${x0},${cy - s} ${x0},${cy + s} ${x0 + dir * s * 1.4},${cy}" fill="${color}"/>`;
  const glyph = {
    pause: `<rect x="${cx - s * 0.8}" y="${cy - s}" width="${s * 0.55}" height="${2 * s}" fill="${color}"/><rect x="${cx + s * 0.25}" y="${cy - s}" width="${s * 0.55}" height="${2 * s}" fill="${color}"/>`,
    play: tri(cx - s * 0.55, 1),
    rewind: tri(cx, -1) + tri(cx + s * 1.2, -1),
  }[kind];
  return circle + (glyph ?? '');
}

async function mediaParts(media, box, ctx) {
  const { W, get, fonts, color, errors, sizes, contentDir } = ctx;
  const svg = [], comps = [];
  const small = get('layout.small_px', MIN_FONT_PX);
  const fSmall = { family: fonts.sans, weight: 400, size: small }, fSmallB = { ...fSmall, weight: 700 };
  const centerBox = (wPct) => ({ x: (W - (W * wPct) / 100) / 2, w: (W * wPct) / 100 });
  if (media.kind === 'image') {
    const paths = [].concat(media.paths ?? media.path).map((p) => path.resolve(contentDir, p));
    for (const p of paths) if (!fs.existsSync(p)) errors.push(`이미지 없음: ${p}`);
    if (errors.length) return { svg, comps };
    const layouts = get('photo.layouts', []);
    const cells = [];
    if (media.layout === 'two') {
      const [each, gap] = pctNums(layouts.find((s) => s.startsWith('2장')), /각 약 (\d+)%.*간격 (\d+)%/) ?? get('photo.two_each_gap_pct', [35, 4]);
      const w = (W * each) / 100, g = (W * gap) / 100, x0 = (W - 2 * w - g) / 2;
      cells.push([x0, box.y, w, box.h], [x0 + w + g, box.y, w, box.h]);
    } else if (media.layout === 'grid2x2') {
      const [tot] = pctNums(layouts.find((s) => s.startsWith('2x2')), /폭 (\d+)%/) ?? [get('photo.grid_width_pct', 80)];
      const g = (W * get('photo.grid_gap_pct', 2)) / 100, { x } = centerBox(tot), cw = ((W * tot) / 100 - g) / 2, ch = (box.h - g) / 2;
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells.push([x + i * (cw + g), box.y + j * (ch + g), cw, ch]);
    } else {
      const r = pctNums(layouts.find((s) => s.startsWith('1장')), /폭 (\d+)~(\d+)%/) ?? get('photo.single_width_pct', [64, 90]);
      const { x, w } = centerBox(mid(r));
      cells.push([x, box.y, w, box.h]);
    }
    if (paths.length !== cells.length) errors.push(`이미지 ${paths.length}장인데 layout=${media.layout ?? 'single'} 은 ${cells.length}칸`);
    for (let i = 0; i < Math.min(paths.length, cells.length); i++) {
      const [x, y, w, h] = cells[i].map(Math.round);
      const input = await sharp(paths[i]).resize(w, h, { fit: 'contain', background: color.bg }).flatten({ background: color.bg }).toBuffer();
      comps.push({ input, left: x, top: y });
    }
    return { svg, comps };
  }
  const { x, w } = centerBox(get('photo.chart_width_pct', 83));
  let y = box.y;
  if (media.title) {
    sizes.push(small);
    svg.push(textEl(x, baselineIn(y, small * 1.6, small), media.title, fSmallB, color.body));
    y += small * 1.6 + small * 0.4;
  }
  if (media.kind === 'bar_chart') {
    const rows = media.rows ?? [];
    const rowH = Math.min((box.y + box.h - y) / Math.max(rows.length, 1), small * 2.4);
    if (rowH < small * 1.3) errors.push(`막대 그래프 ${rows.length}줄이 미디어 자리에 안 들어감`);
    const labelW = w * 0.32, valueW = w * 0.16, barW = w - labelW - valueW, maxV = Math.max(...rows.map((r) => r.value), 1);
    sizes.push(small);
    rows.forEach((r, i) => {
      const top = y + i * rowH, f = r.highlight ? fSmallB : fSmall;
      const fill = r.highlight ? color.accentChart : color.chartBar;
      svg.push(textEl(x, baselineIn(top, rowH, small), r.label, f, color.body));
      svg.push(`<rect x="${x + labelW}" y="${top + rowH * 0.22}" width="${Math.max(2, (barW * r.value) / maxV)}" height="${rowH * 0.56}" fill="${fill}"/>`);
      svg.push(textEl(x + w, baselineIn(top, rowH, small), `${r.value}${r.unit ?? ''}`, f, color.body, 'end'));
    });
    y += rows.length * rowH;
  } else if (media.kind === 'stat_cards') {
    const cards = media.cards ?? [], cw = w / Math.max(cards.length, 1);
    const big = { family: fonts.sans, weight: 800, size: Math.round(small * get('layout.stat_big_x_small', 2.2)) };
    sizes.push(small, big.size);
    cards.forEach((c, i) => {
      const cx = x + cw * (i + 0.5);
      svg.push(textEl(cx, y + big.size, c.big, big, color.body, 'middle'));
      svg.push(textEl(cx, y + big.size * 1.3 + small * 1.2, c.label, fSmall, color.body, 'middle'));
    });
    y += big.size * 1.3 + small * 1.6;
  } else errors.push(`알 수 없는 media.kind: ${media.kind}`);
  // 그래프·카드는 미디어 자리(본문 아래 하단 영역) 안에서 세로 가운데.
  const dy = Math.max(0, (box.y + box.h - y) / 2);
  return { svg: [`<g transform="translate(0,${dy.toFixed(1)})">`, ...svg, '</g>'], comps };
}

// ── 한 장 ───────────────────────────────────────────────────────────
async function renderSlide(slide, deck, ctx) {
  const { W, H, get, fonts, color, fam, famKey } = ctx;
  const errors = [], warnings = [], sizes = [];
  const svg = [`<rect width="${W}" height="${H}" fill="${color.bg}"/>`];
  const margin = {
    top: mid(get('layout.margin_pct.top', [6, 11])),
    left: mid(get('layout.margin_pct.left', [10, 14])),
    right: mid(get('layout.margin_pct.right', [6, 9])),
    bImg: mid(get('layout.margin_pct.bottom_with_image', [3, 8])),
    bText: get('layout.margin_pct.bottom_text_only', [15, 45]),
  };
  const bodyPx = get('layout.body_px', 32);
  const lhX = mid(get(`layout.line_height_x.${famKey}`, famKey === 'A' ? [1.55, 1.7] : [1.75, 1.9]));
  const face = String(fam.font ?? '').startsWith('serif') ? fonts.serif : fonts.sans;
  const fBody = { family: face, weight: 400, size: bodyPx }, fBold = { ...fBody, weight: 700 };
  const textX = (W * margin.left) / 100, maxW = W * (1 - (margin.left + margin.right) / 100);
  const lh = bodyPx * lhX, paraGap = lh * get('layout.paragraph_blank_lines', 1);
  const charsRange = get('line_breaking.chars_per_line', [14, 33]);
  const isCover = slide.role === 'cover' || slide.no === 0;
  const ctxM = { ...ctx, errors, sizes };

  // 굵은 문단 규칙
  let paras = (slide.paragraphs ?? []).map((p) => ({ ...p }));
  if (!isCover) {
    if (famKey === 'A' && get('template_family.A.headline_sentence_bold', true) && paras.length && !paras.some((p) => p.bold)) {
      paras[0].bold = true;
      warnings.push('A형 headline_sentence_bold: 굵은 문단이 없어 첫 문단을 굵게 했다');
    }
    const [bMin, bMax] = get('emphasis.per_slide_bold_blocks', [1, 2]);
    const nb = paras.filter((p) => p.bold).length;
    if (nb < bMin || nb > bMax) warnings.push(`굵은 문단 ${nb}개 — 스펙 범위 ${bMin}~${bMax} 밖`);
  }

  // 문단을 먼저 다 감싸 높이를 정확히 안 뒤에 그린다.
  const plan = [];
  for (const p of paras) {
    const f = p.bold ? fBold : fBody;
    sizes.push(f.size);
    const wrapped = await wrapText(p.text, f, maxW, errors);
    wrapped.forEach((l, j) => {
      const n = [...l].length, last = j === wrapped.length - 1;
      if (n > charsRange[1] || (!last && n < charsRange[0])) warnings.push(`줄 글자 수 ${n} — 스펙 범위 ${charsRange[0]}~${charsRange[1]} 밖: "${l}"`);
    });
    plan.push({ f, wrapped });
  }
  const parasH = plan.reduce((h, p) => h + p.wrapped.length * lh, 0) + Math.max(0, plan.length - 1) * paraGap;
  const drawParas = (startY) => {
    let y = startY;
    plan.forEach((p, i) => {
      for (const l of p.wrapped) { svg.push(textEl(textX, baselineIn(y, lh, p.f.size), l, p.f, color.body)); y += lh; }
      if (i < plan.length - 1) y += paraGap;
    });
    return y;
  };
  let lines = plan.reduce((n, p) => n + p.wrapped.length, 0), textBottom;

  if (isCover) {
    const ct = get('layout.cover_title', {});
    const ratio = ct.size_x_body ?? get('layout.cover_title.size_x_body', [3.3, 8.5]);
    const heading = slide.heading ?? [];
    if (heading.length !== (ct.lines ?? 3)) warnings.push(`표지 제목 ${heading.length}줄 — 스펙 ${ct.lines ?? 3}줄`);
    const tlhX = get('layout.cover_title.line_height_x', 1.2);
    const small = get('layout.small_px', MIN_FONT_PX);
    const fSmall = { family: fonts.sans, weight: 400, size: small };
    const fT = (s) => ({ family: face, weight: 900, size: s });
    const top = (H * margin.top) / 100 + small * 2.5; // 연재 라벨 자리 아래
    const limit = slide.media
      ? H * (1 - margin.bImg / 100 - get('layout.cover_media_min_pct', 35) / 100)
      : H * (1 - margin.bText[0] / 100);
    const paraBlock = plan.length ? lh * 0.8 + parasH : 0;
    // 배율 중앙값에서 시작해, 제일 긴 줄이 폭에, 묶음이 높이에 들어갈 때까지 줄인다(배율 하한 밑이면 경고).
    let size = Math.round(bodyPx * mid(ratio));
    const widest = async (s) => Math.max(0, ...(await Promise.all(heading.map((l) => measure(l, fT(s))))));
    while (size > bodyPx && ((await widest(size)) > maxW || heading.length * size * tlhX + paraBlock > limit - top)) size -= 2;
    if (size < bodyPx * ratio[0]) warnings.push(`표지 제목 ${size}px = 본문의 ${(size / bodyPx).toFixed(2)}배 — 스펙 하한 ${ratio[0]}배 미만(제목 줄이 길거나 글이 많다)`);
    const tlh = size * tlhX, blockH = heading.length * tlh + paraBlock;
    const align = String(ct.align ?? 'center').startsWith('center') ? 'middle' : 'start';
    const ax = align === 'middle' ? W / 2 : textX;
    let y = slide.media ? top : top + Math.max(0, (limit - top - blockH) / 2);
    if (deck.series_label) {
      sizes.push(small);
      svg.push(textEl(textX, baselineIn((H * margin.top) / 100, small * 1.5, small), deck.series_label, { ...fSmall, weight: 700 }, color.body));
    }
    sizes.push(size);
    for (const l of heading) { svg.push(textEl(ax, baselineIn(y, tlh, size), l, fT(size), color.coverTitle, align)); y += tlh; }
    if (plan.length) y = drawParas(y + lh * 0.8);
    lines += heading.length;
    textBottom = y;
    if (deck.handle && !slide.media) {
      sizes.push(small);
      svg.push(textEl(textX, H - (H * margin.bImg) / 100 - small * 0.3, deck.handle, fSmall, color.body));
    }
  } else if (famKey === 'B') {
    const nSize = Math.round(bodyPx * get('template_family.B.number_label.size_x_body', 1.4));
    sizes.push(nSize);
    svg.push(textEl((W * get('template_family.B.number_label.x_pct', 10)) / 100, (H * get('template_family.B.number_label.y_pct', 7)) / 100 + nSize * 0.85,
      String(slide.no).padStart(2, '0'), { family: fonts.serif, weight: 700, size: nSize }, color.body));
    const top = (H * get('template_family.B.body_start_y_pct', 12.8)) / 100;
    textBottom = drawParas(top);
    svg.push(`<rect x="${(W * get('template_family.B.vertical_bar.x_pct', 10)) / 100}" y="${top}" width="${get('template_family.B.vertical_bar.thickness_px', 2)}" height="${textBottom - top}" fill="${color.bar}"/>`);
  } else {
    const rule = fam.top_rule ?? {};
    const ry = (H * get('template_family.A.top_rule.y_pct', 10)) / 100, rw = (W * get('template_family.A.top_rule.width_pct', 82)) / 100;
    const rx = (W * get('template_family.A.top_rule.x_pct', (100 - (rule.width_pct ?? 82)) / 2)) / 100;
    svg.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${get('template_family.A.top_rule.thickness_px', 2)}" fill="${color.bar}"/>`);
    const bodyTop = (H * get('template_family.A.body_start_y_pct', 31)) / 100;
    if (slide.icon) {
      const iconStr = String(fam.icon ?? '');
      const d = (W * (pctNums(iconStr, /지름 약 (\d+)%/)?.[0] ?? get('template_family.A.icon_diameter_pct', 13))) / 100;
      const xr = pctNums(iconStr, /x (\d+)~(\d+)%/) ?? get('template_family.A.icon_x_pct', [7, 20]);
      const cy = (H * get('template_family.A.icon_center_y_pct', ((ry / H) * 100 + (bodyTop / H) * 100) / 2)) / 100;
      svg.push(iconSvg(slide.icon, (W * mid(xr)) / 100, cy, d, color.body));
    }
    textBottom = drawParas(bodyTop);
  }

  const comps = [];
  if (slide.media) {
    const gap = (H * get('layout.media_gap_pct', 4)) / 100;
    const box = { y: textBottom + gap, h: H * (1 - margin.bImg / 100) - textBottom - gap };
    if (box.h < H * 0.15) errors.push(`미디어 자리 부족: 글 아래 남은 높이 ${Math.round(box.h)}px`);
    else {
      const m = await mediaParts(slide.media, box, ctxM);
      svg.push(...m.svg);
      comps.push(...m.comps);
    }
  } else if (textBottom > H * (1 - margin.bText[0] / 100)) {
    errors.push(`글이 넘침: 끝 ${Math.round(textBottom)}px > 하단 여백 하한 ${margin.bText[0]}% 선 ${Math.round(H * (1 - margin.bText[0] / 100))}px`);
  }

  const chars = [...(slide.heading ?? []), ...paras.map((p) => p.text)].join('').replace(/\n/g, '').length;
  const cps = get('voice.chars_per_slide', {});
  if (!isCover && (chars < (cps.min ?? 10) || chars > (cps.max ?? 300))) warnings.push(`장당 글자 ${chars} — 스펙 범위 ${cps.min}~${cps.max} 밖`);
  const lps = get('voice.lines_per_slide', {});
  if (lines > (lps.max ?? 13)) warnings.push(`장당 줄 ${lines} — 스펙 최대 ${lps.max} 초과`);
  const minFont = Math.min(...sizes);
  if (minFont < MIN_FONT_PX) errors.push(`최소 글자 크기 ${minFont}px < ${MIN_FONT_PX}px`);

  const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`;
  const buf = await sharp(Buffer.from(svgDoc)).composite(comps).flatten({ background: color.bg }).jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return { buf, chars, lines, minFont, errors, warnings };
}

// ── 묶음 ────────────────────────────────────────────────────────────
/** 렌더하고 manifest 를 돌려준다. errors 가 비어 있지 않으면 호출자가 실패로 처리한다. */
export async function renderDeck({ spec, content, outDir, fonts: fontOpt = 'noto', contentDir = process.cwd() }) {
  assertOutsideRepo(outDir);
  const warnings = [];
  const d = effectiveSpec(spec);
  const get = makeGet(d, warnings);

  const canvas = content.canvas ?? get('canvas.default', '1:1');
  if (!CANVAS[canvas] || !get('canvas.ratio_choices', []).some((s) => s.startsWith(canvas))) throw new Error(`canvas ${canvas} 는 스펙 선택지에 없다`);
  const [W, H] = CANVAS[canvas];
  const famKey = content.family ?? get('template_family.default', 'B');
  const fam = d.template_family?.[famKey];
  if (!fam) throw new Error(`template_family ${famKey} 가 스펙에 없다`);

  let fontSet = fontOpt;
  if (fontOpt === 'noto' && !notoInstalled()) {
    fontSet = 'system';
    const msg = 'Noto Sans/Serif KR(OFL)이 설치돼 있지 않아 시스템 폰트(맑은 고딕·바탕)로 폴백';
    warnings.push(msg);
    console.log(`[ig-card] ${msg}`);
  }
  const fonts = FONT_SETS[fontSet];
  if (!fonts) throw new Error(`--fonts 는 noto|system: ${fontOpt}`);
  const color = {
    bg: get('color.background', '#FFFFFF'),
    body: get('color.body.default', '#333333'),
    coverTitle: get('color.cover_title', '#000000'),
    bar: get('color.vertical_bar', '#666666'),
    accentChart: get('color.accent.allowed_in_chart_only', '#E04B4B'),
    chartBar: get('color.chart_bar', '#BBBBBB'),
  };
  const ctx = { W, H, get, fonts, color, fam, famKey, contentDir };

  fs.mkdirSync(outDir, { recursive: true });
  const slides = [], errors = [];
  for (const [i, slide] of (content.slides ?? []).entries()) {
    const file = `slide-${String(i + 1).padStart(2, '0')}.jpg`;
    const r = await renderSlide(slide, content, ctx);
    fs.writeFileSync(path.join(outDir, file), r.buf);
    slides.push({ file, no: slide.no, role: slide.role, chars: r.chars, lines: r.lines, min_font_px: r.minFont, warnings: r.warnings, errors: r.errors });
    errors.push(...r.errors.map((e) => `${file}: ${e}`));
    for (const w of r.warnings) console.log(`[ig-card] ${file}: ${w}`);
  }
  const deckRange = get('deck.slides', { min: 9, max: 13 });
  if (slides.length < deckRange.min || slides.length > deckRange.max) warnings.push(`장 수 ${slides.length} — 스펙 범위 ${deckRange.min}~${deckRange.max} 밖`);
  const tagMax = pctNums(get('caption.generator_default', ''), /해시태그 (\d+)개/)?.[0];
  if (tagMax && (content.hashtags ?? []).length > tagMax) warnings.push(`해시태그 ${content.hashtags.length}개 — 임시 기본값 ${tagMax}개 이내 초과`);

  const manifest = {
    generated_at: new Date().toISOString(),
    spec_version: spec.version ?? null,
    title: content.title ?? null,
    canvas, size: [W, H], family: famKey, jpeg_quality: JPEG_QUALITY,
    renderer: 'sharp + SVG(librsvg/Pango)', fonts: { set: fontSet, ...fonts, files: undefined },
    min_font_px: Math.min(...slides.map((s) => s.min_font_px)), min_font_required_px: MIN_FONT_PX,
    slides, warnings, errors,
    caption: content.caption ?? null, hashtags: content.hashtags ?? [],
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function main() {
  const { values } = parseArgs({ options: { spec: { type: 'string' }, content: { type: 'string' }, out: { type: 'string' }, fonts: { type: 'string', default: 'noto' } } });
  if (!values.spec || !values.content || !values.out) {
    console.error('사용법: node scripts/ig-card/render.mjs --spec <spec.json> --content <card.json> --out <리포 밖 폴더> [--fonts noto|system]');
    process.exit(2);
  }
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const m = await renderDeck({ spec: read(values.spec), content: read(values.content), outDir: values.out, fonts: values.fonts, contentDir: path.dirname(path.resolve(values.content)) });
  console.log(`[ig-card] ${m.slides.length}장 → ${path.resolve(values.out)} (최소 글자 ${m.min_font_px}px, 경고 ${m.warnings.length + m.slides.reduce((n, s) => n + s.warnings.length, 0)}, 에러 ${m.errors.length})`);
  if (m.errors.length) {
    for (const e of m.errors) console.error(`[ig-card] 에러 ${e}`);
    process.exit(1);
  }
}

// 실행 진입 판정은 실경로로 비교한다. 정션·심볼릭 링크 경로로 부르면 argv[1] 은 링크 경로, import.meta.url 은 실경로라
// 문자열 비교가 어긋나 main() 을 건너뛰고 출력 없이 exit 0 으로 끝났다(ai-tone-lint 와 같은 버그, v71ab).
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && pathToFileURL(real(process.argv[1])).href === pathToFileURL(real(fileURLToPath(import.meta.url))).href) {
  main().catch((e) => { console.error(`[ig-card] 실패: ${e.message}`); process.exit(1); });
}
