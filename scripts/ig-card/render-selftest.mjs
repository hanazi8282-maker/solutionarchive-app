#!/usr/bin/env node
// scripts/ig-card/render.mjs 셀프테스트. 출력은 OS 임시 폴더에 쓰고 끝나면 지운다.
// 아래 카드 내용은 전부 [FIXTURE — 실제 데이터 아님] 이다. 수치·문장 모두 지어낸 것.
// 스펙 입력은 PR #543(docs/v71s-ig-style-spec) 의 ig-style-spec.json 사본(fixture-style-spec.json).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderDeck, wrapText, assertOutsideRepo } from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture-style-spec.json'), 'utf8'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-card-selftest-'));
const FIX = '[FIXTURE — 실제 데이터 아님]';

const P = (text, bold = false) => ({ text, bold });
const deck = (family, canvas, img) => ({
  title: `${FIX} 테스트 묶음`, family, canvas, series_label: '고객의 말', handle: '@solution_arch_',
  slides: [
    { no: 0, role: 'cover', heading: ['가짜 제목', '세 줄짜리', '표지다'], paragraphs: [P(FIX)], icon: null, media: null },
    { no: 1, role: 'problem', heading: null, icon: 'pause', media: null,
      paragraphs: [P('이 문장은 굵게 그리는 첫 문단이다.', true), P('줄바꿈은 입력의 줄바꿈을 먼저 따른다.\n그다음 넘치면 어절 경계에서만 자동으로 끊어서 여러 줄로 나눈다는 것을 확인하려고 일부러 길게 쓴 문장이다.')] },
    { no: 2, role: 'evidence', heading: null, icon: 'play', paragraphs: [P('가짜 막대 그래프 아래에 붙는다.', true)],
      media: { kind: 'bar_chart', title: `${FIX} 가짜 비율`, rows: [{ label: '항목 가', value: 31, unit: '%', highlight: true }, { label: '항목 나', value: 18, unit: '%' }, { label: '항목 다', value: 9, unit: '%' }] } },
    { no: 3, role: 'case', heading: null, icon: 'rewind', paragraphs: [P('가짜 수치 카드 두 장.', true)],
      media: { kind: 'stat_cards', cards: [{ big: '31%', label: '가짜 지표' }, { big: '2배', label: '가짜 비교' }] } },
    { no: 4, role: 'recap', heading: null, icon: null, paragraphs: [P('가짜 사진 두 장을 나란히 둔다.', true)],
      media: { kind: 'image', path: [img, img], layout: 'two' } },
    { no: 5, role: 'closing', heading: null, icon: null, paragraphs: [P('마지막 장은 굵은 문장 하나로 닫는다.', true)], media: null },
  ],
  caption: `${FIX} 캡션`, hashtags: ['가짜태그'],
});

const gray = async (file) => sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
/** 행 범위 [y0,y1) 안의 어두운(<128) 픽셀 비율과 가장 왼쪽 어두운 열. */
async function darkStats(file, y0p, y1p) {
  const { data, info } = await gray(file);
  const y0 = Math.floor(info.height * y0p), y1 = Math.floor(info.height * y1p);
  let n = 0, left = Infinity;
  for (let y = y0; y < y1; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 128) { n++; left = Math.min(left, x); }
  return { ratio: n / ((y1 - y0) * info.width), left };
}
/** JPEG DQT 첫 휘도 양자화값. libjpeg 표준표 기준 q90 → 3, q75 → 8. */
function firstQuant(buf) {
  for (let i = 2; i < buf.length - 5; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xdb) return buf[i + 5];
    i += 2 + len;
  }
  return null;
}

let passed = 0;
const ok = (name) => { passed++; console.log(`  ok  ${name}`); };
try {
  const img = path.join(TMP, 'fixture-photo.png');
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#8899AA' } }).png().toFile(img);

  for (const [family, canvas, H] of [['B', '1:1', 1080], ['A', '4:5', 1350]]) {
    const out = path.join(TMP, `${family}-${canvas.replace(':', 'x')}`);
    const m = await renderDeck({ spec: SPEC, content: deck(family, canvas, img), outDir: out });
    assert.deepEqual(m.errors, [], `렌더 에러: ${m.errors.join(' / ')}`);
    assert.equal(m.slides.length, 6);
    for (const s of m.slides) {
      const buf = fs.readFileSync(path.join(out, s.file));
      assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], `${s.file} JPEG 매직바이트`);
      const meta = await sharp(buf).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.deepEqual([meta.width, meta.height], [1080, H], `${s.file} 크기`);
      assert.ok(buf.length >= 15_000, `${s.file} 용량 ${buf.length}B < 15KB`);
      assert.ok(firstQuant(buf) <= 4, `${s.file} 양자화값 ${firstQuant(buf)} — 품질 90 아님`);
      assert.ok(s.min_font_px >= 30, `${s.file} 최소 글자 ${s.min_font_px}px`);
    }
    const body = await darkStats(path.join(out, 'slide-02.jpg'), family === 'A' ? 0.31 : 0.13, 0.6);
    assert.ok(body.ratio > 0.005, `본문 영역 어두운 픽셀 ${body.ratio} — 한글이 안 그려짐`);
    const mf = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.ok(mf.slides[1].chars > 0 && mf.min_font_px >= 30 && mf.warnings.some((w) => w.startsWith('관찰 불가')), 'manifest 내용');
    ok(`${family}형 ${canvas}: 6장 ${1080}x${H} JPEG(매직·DQT≤4·≥15KB), 본문 어두운 픽셀 ${(body.ratio * 100).toFixed(2)}%, manifest`);
  }

  // 스펙 값 변경 → 결과 변경: 왼쪽 여백 12% → 22% 면 본문 왼쪽 경계가 그만큼 오른쪽으로 간다.
  const moved = structuredClone(SPEC);
  moved.override.layout = { margin_pct: { left: [20, 24] } };
  const a = path.join(TMP, 'margin-a'), b = path.join(TMP, 'margin-b');
  const one = (d) => ({ ...d, slides: [d.slides[5]] });
  await renderDeck({ spec: SPEC, content: one(deck('A', '1:1', img)), outDir: a });
  await renderDeck({ spec: moved, content: one(deck('A', '1:1', img)), outDir: b });
  const la = (await darkStats(path.join(a, 'slide-01.jpg'), 0.31, 0.6)).left, lb = (await darkStats(path.join(b, 'slide-01.jpg'), 0.31, 0.6)).left;
  assert.ok(Math.abs(la - 1080 * 0.12) < 15 && Math.abs(lb - 1080 * 0.22) < 15, `왼쪽 경계 ${la} → ${lb}`);
  ok(`override.layout.margin_pct.left 12%→22%: 본문 왼쪽 경계 ${la}px → ${lb}px`);

  // 최소 글자 크기 미달은 실패로 보고된다.
  const tiny = structuredClone(SPEC);
  tiny.override.layout = { body_px: 24 };
  const mt = await renderDeck({ spec: tiny, content: one(deck('B', '1:1', img)), outDir: path.join(TMP, 'tiny') });
  assert.ok(mt.errors.some((e) => e.includes('최소 글자 크기 24px')), mt.errors.join(' / '));
  ok('본문 24px 스펙은 "최소 글자 크기" 에러');

  // 줄바꿈은 어절 경계에서만.
  const errs = [], f = { family: 'Noto Sans KR', weight: 400, size: 32 };
  const src = '어절 중간에서 끊기지 않고 조사도 앞말에 붙은 채로 다음 줄로 넘어가는지 본다';
  const lines = await wrapText(src, f, 300, errs);
  assert.ok(lines.length > 2 && errs.length === 0);
  assert.equal(lines.join(' '), src, '어절이 쪼개졌다');
  const errs2 = [];
  await wrapText('가나다라마바사아자차카타파하가나다라', f, 200, errs2);
  assert.ok(errs2.length === 1, '폭보다 긴 어절은 에러');
  ok(`어절 경계 줄바꿈(${lines.length}줄), 폭보다 긴 어절은 에러`);

  // 출력 폴더가 리포 안이면 거부, 아무것도 만들지 않는다.
  const inRepo = path.join(HERE, 'out-should-not-exist');
  await assert.rejects(renderDeck({ spec: SPEC, content: deck('B', '1:1', img), outDir: inRepo }), /git 리포/);
  assert.ok(!fs.existsSync(inRepo));
  assert.doesNotThrow(() => assertOutsideRepo(TMP));
  ok('리포 안 출력 폴더 거부(폴더 미생성), 임시 폴더 허용');

  // CLI 를 링크 경로로 불러도 main() 이 돈다 — 인자 없이 부르면 사용법 + exit 2(조용한 exit 0 금지).
  const link = path.join(TMP, 'link');
  fs.symlinkSync(HERE, link, 'junction');
  const r = spawnSync(process.execPath, [path.join(link, 'render.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 2, `링크 경로 실행 exit ${r.status}`);
  assert.match(r.stderr, /사용법/);
  ok('링크 경로로 실행해도 CLI 가 돈다(인자 없음 → exit 2)');

  console.log(`render-selftest: ${passed} passed`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
