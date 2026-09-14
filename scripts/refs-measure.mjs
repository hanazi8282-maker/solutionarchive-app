// refs-measure.mjs — EO 레퍼런스 30건 실측
// 사용: node refs-measure.mjs [dump|table|json]
//   dump  : 글별 도입/마무리/소제목/버린 줄 덤프 (수동 분류용)
//   table : 마크다운 실측 표 + 전체 통계
//   json  : 전체 결과 JSON
import fs from 'node:fs';

// 레퍼런스 원문(EO 아티클 30건, 남헌 붙여넣기)은 저작물이라 리포에 넣지 않는다. 경로를 인자나 REFS_SRC 로 준다.
const SRC = process.env.REFS_SRC || process.argv.find((a) => a.endsWith(".txt")) || "C:/Users/DCU/AppData/Local/Temp/sa-pilot/refs.txt";
const mode = process.argv[2] || 'table';

// ---------- 수동 분류 (원문을 읽고 적음. 스크립트가 못 세는 항목) ----------
// 제목: 주인공(사람·회사) 이름 / 성과 숫자(한글 수사 포함) / 성과 숫자가 아라비아인가
const TITLE = {
  1:{hero:0,result:0,arab:0}, 2:{hero:1,result:0,arab:0}, 3:{hero:0,result:1,arab:1}, 4:{hero:1,result:0,arab:0},
  5:{hero:0,result:1,arab:0}, 6:{hero:0,result:1,arab:1}, 7:{hero:0,result:1,arab:1}, 8:{hero:0,result:1,arab:1},
  9:{hero:1,result:1,arab:1}, 10:{hero:0,result:1,arab:1}, 11:{hero:0,result:1,arab:1}, 12:{hero:1,result:1,arab:1},
  13:{hero:0,result:0,arab:0}, 14:{hero:0,result:1,arab:1}, 15:{hero:1,result:1,arab:1}, 16:{hero:1,result:0,arab:0},
  17:{hero:0,result:1,arab:1}, 18:{hero:1,result:1,arab:1}, 19:{hero:0,result:1,arab:1}, 20:{hero:0,result:1,arab:1},
  21:{hero:0,result:0,arab:0}, 22:{hero:0,result:1,arab:1}, 23:{hero:0,result:1,arab:0}, 24:{hero:0,result:1,arab:1},
  25:{hero:0,result:1,arab:1}, 26:{hero:0,result:1,arab:0}, 27:{hero:0,result:1,arab:1}, 28:{hero:0,result:1,arab:1},
  29:{hero:0,result:1,arab:1}, 30:{hero:0,result:1,arab:0},
};
// 도입 유형(첫 실질 문단 기준, 원문 읽고 판정):
//   통념반박 / 반전명제 / 시사(지금 화제·현상) / 장면(구체 장면·인용) / 자기소개 / 정의 / 질문제기(독자 고민→질문)
//   결과제시(주인공+성과 숫자 한 줄) / 인사·예고("안녕하세요, 오늘은 …를 소개")  <- 가이드 H1~H4에 없는 두 유형
const INTRO = {
  1:'자기소개', 2:'질문제기', 3:'결과제시', 4:'시사', 5:'결과제시', 6:'장면', 7:'결과제시', 8:'통념반박',
  9:'인사·예고', 10:'장면', 11:'결과제시', 12:'인사·예고', 13:'시사', 14:'결과제시', 15:'시사', 16:'장면',
  17:'질문제기', 18:'시사', 19:'결과제시', 20:'인사·예고', 21:'장면', 22:'결과제시', 23:'시사', 24:'결과제시',
  25:'결과제시', 26:'시사', 27:'인사·예고', 28:'인사·예고', 29:'인사·예고', 30:'결과제시',
};
// 글 형식(원문 읽고 판정): 인터뷰QA / 서술케이스(한 사람·회사를 3인칭으로 풀어씀) / 큐레이션(여러 사례 나열) / 에세이(화자 경험·주장) / 개념설명
const FORM = {
  1:'에세이', 2:'개념설명', 3:'서술케이스', 4:'인물분석', 5:'큐레이션', 6:'에세이', 7:'인터뷰QA', 8:'큐레이션',
  9:'인터뷰QA', 10:'인터뷰QA', 11:'인터뷰QA', 12:'서술케이스', 13:'개념설명', 14:'인터뷰QA', 15:'서술케이스', 16:'서술케이스',
  17:'인터뷰QA', 18:'인터뷰QA', 19:'인터뷰QA', 20:'서술케이스', 21:'에세이', 22:'서술케이스', 23:'큐레이션', 24:'서술케이스',
  25:'인터뷰QA', 26:'서술케이스', 27:'인터뷰QA', 28:'서술케이스', 29:'인터뷰QA', 30:'인터뷰QA',
};
// 마무리 유형(홍보·참고자료를 잘라낸 뒤 마지막 실질 문단 기준):
//   결론명령 / 배운점정리 / 열린질문·전망 / 홍보 / 기타(소회·응원·인터뷰 답변으로 끝)
const OUTRO = {
  1:'기타(소회·응원)', 2:'배운점정리', 3:'배운점정리', 4:'열린질문·전망', 5:'배운점정리', 6:'기타(소회·응원)', 7:'배운점정리', 8:'배운점정리',
  9:'배운점정리', 10:'기타(소회·응원)', 11:'배운점정리', 12:'열린질문·전망', 13:'결론명령', 14:'배운점정리', 15:'배운점정리', 16:'열린질문·전망',
  17:'결론명령(인터뷰이)', 18:'기타(인터뷰 답변)', 19:'기타(인터뷰 답변)', 20:'배운점정리', 21:'결론명령', 22:'배운점정리', 23:'결론명령', 24:'배운점정리',
  25:'결론명령(인터뷰이)', 26:'배운점정리', 27:'배운점정리', 28:'배운점정리', 29:'배운점정리', 30:'결론명령(인터뷰이)',
};

// ---------- 파싱 ----------
const raw = fs.readFileSync(SRC, 'utf8').split('\n');
const starts = [];
raw.forEach((l, i) => { if (/^- (\d+)$/.test(l)) starts.push(i); });
const blocks = [];
for (let k = 0; k < 30; k++) blocks.push(raw.slice(starts[k], starts[k + 1]).map(l => l.replace(/^    /, '')));

const END_RE = /님이 궁금하신가요\?|^\*\*댓글 \d+\*\*|^\*\*추천 아티클\*\*|^댓글이 없습니다|^\*\*오늘의 QnA\*\*/;
const PROMO_RE = /구독하러|구독을 해주세요|구독해보세요|구독해주세요|구독하기|뉴스레터 보기|발행되었|추천해주시면|레퍼럴|이오레터 구독|뉴스레터를 구독하면|뉴스레터를 주변에|실렸습니다|메일함으로 보내드립니다|grum\.jeon|@gmail\.com|^이메일\s*[:：]/;
const AD_RE = /^(투자유치|투자|비즈니스법,회사법|사회과학도서 검색|업무소프트웨어 체험|지식 관리 솔루션|사업계획|사업컨설팅|법인설립|세무회계|마케팅대행|브랜딩|홈페이지제작|앱개발|IT컨설팅|ai\s*솔루션|경영컨설팅|스타트업 투자|투자자문|회계|법률자문|특허|디자인|외주개발|앱제작|웹개발|데이터분석|온라인마케팅|SNS마케팅|퍼포먼스마케팅|광고대행|기타)$/i;

function stripMd(s) {
  return s
    .replace(/ /g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\(https?:\/\/[^)\s]*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/\*\*/g, '')
    .replace(/(^|\s)\*(\S)/g, '$1$2').replace(/(\S)\*(\s|$|[.,!?])/g, '$1$2')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parse(block, idx) {
  let title = '', tIdx = -1;
  block.forEach((l, i) => { if (tIdx < 0 && /^# \*\*/.test(l)) { tIdx = i; title = l.replace(/^# \*\*/, '').replace(/\*\*$/, '').trim(); } });
  // 본문 시작: 조회수 숫자 줄 다음
  let vIdx = -1;
  for (let i = tIdx + 1; i < block.length; i++) if (/^\d{1,3}(,\d{3})*$/.test(block[i].trim())) { vIdx = i; break; }
  let lines = block.slice(vIdx + 1);
  // 본문 끝
  let endI = lines.findIndex(l => END_RE.test(l.trim()));
  if (endI >= 0) lines = lines.slice(0, endI);
  // 뒤쪽 홍보 절(소제목/굵은줄에 구독·레터) 이후 전부 제거 — 본문 후반 40% 안에서만
  // 뒤쪽 홍보·참고자료 절: 소제목/굵은 줄에 아래 표지가 있으면 거기부터 끝까지 본문이 아님 (본문 후반 45% 안에서만)
  const CUT_HEAD_RE = /(구독하러|구독을 해주세요|구독하기|뉴스레터를 구독하면|레터가 좋았다면|참고 ?자료|References|신청 링크|리서치 ?클럽|솔로프리너 랩|글쓰기 클럽|인프런에|아이디어 노트 템플릿|매주 스타트업 이야기|더 많은 언섹시|더 자세한 이야기가 궁금하신가요|>>> 유튜브|뉴스레터는 어떠셨나요|의견 등록하기)/;
  const CUT_LINE_RE = /(^=+$|^본 아티클은 .*바탕|^>>> 유튜브|구독하러 가기|^※ References|^※ 이 글은|리서치 클럽이 모집|모집을 시작하였습니다)/;
  const cutFrom = lines.findIndex((l, i) => {
    const t = l.replace(/ /g, ' ').trim();
    if (i <= lines.length * 0.55) return false;
    if (/^(#{2,6}\s|\*\*)/.test(t)) return CUT_HEAD_RE.test(t.replace(/^#+\s*|\*\*/g, ''));
    return CUT_LINE_RE.test(t.replace(/^[-*\s>]+/, '').replace(/\*/g, ''));
  });
  if (cutFrom >= 0) lines = lines.slice(0, cutFrom);

  const dropped = [];
  const kept = [];
  const trimmedAll = lines.map(l => l.trim());
  for (let i = 0; i < trimmedAll.length; i++) {
    const t = trimmedAll[i];
    if (t === '') { kept.push(''); continue; }
    if (/^!\[/.test(t) || /^\[\]\(/.test(t)) continue;           // 이미지·빈링크
    if (/^\d+:\d\d$/.test(t) || t === '/' ) continue;             // 오디오 플레이어
    if (t === `**${title}**`) continue;                            // 제목 중복
    if (/^(이미지 |사진 )?(출처|사진|제공)\s*[:：]/.test(t.replace(/^[>\s*!]+|\*+$/g, ''))) { dropped.push(t); continue; }   // 이미지 캡션
    { // 근처(±4줄)에 같은 텍스트가 또 있으면 캡션 반복 → 버림
      const norm = x => (x || '').replace(/^[>!\s*]+/, '').replace(/[*\s]+$/, '').replace(/\*/g, '').trim();
      const me = norm(t);
      if (me.length < 120 && !/^(#{1,6}\s|\d+[.)]\s|-\s)/.test(t) && [-4, -2, 2, 4].some(d => norm(trimmedAll[i + d]) === me)) { dropped.push(t); continue; }
    }
    if (/^!/.test(t) && t.length < 120) { dropped.push(t); continue; }        // 이미지 alt 잔재
    if (/^첨부 이미지$/.test(t)) { dropped.push(t); continue; }
    if (/^[가-힣A-Za-z ,·&]{2,14}$/.test(t) && !/(다|요|죠|니다|까|음|함|됨)$/.test(t) && !/^(Q|A)[.:]/.test(t)) { dropped.push(t); continue; } // EO 광고 키워드·짧은 캡션
    if (/^\(?(출처|제공|이미지|사진)\s*[:：]/.test(t) && (trimmedAll[i + 2] === t || trimmedAll[i - 2] === t)) { dropped.push(t); continue; } // 반복 캡션
    if (trimmedAll[i + 2] === t && trimmedAll[i + 4] === t) { dropped.push(t); i += 4; continue; } // 3연속 동일(캡션)
    if (trimmedAll[i - 2] === t && trimmedAll[i - 4] === t) { dropped.push(t); continue; }
    if (trimmedAll[i - 2] === t && !/^[#>\-*\d]/.test(t) && t.length < 40) { dropped.push(t); continue; }
    if (AD_RE.test(t)) { dropped.push(t); continue; }
    kept.push(t);
  }
  // 문단: 빈 줄로 구분, 연속 줄은 한 문단(인용 블록·리스트)
  const paras = [];
  let cur = [];
  for (const l of kept) { if (l === '') { if (cur.length) paras.push(cur.join('\n')); cur = []; } else cur.push(l); }
  if (cur.length) paras.push(cur.join('\n'));
  // 홍보 문단 제거, 구분선 제거
  const paras2 = paras.filter(p => !(PROMO_RE.test(p) && /(레터|구독|추천|메일|gmail)/.test(p)) && !/^-{3,}$/.test(p.trim()) && !/^#+$/.test(p.trim()) && stripMd(p).length > 0)
    .map(p => p.split('\n').filter(l => !/^>\s*$/.test(l)).join('\n'));

  // 소제목 판정
  const isBoldLine = p => !p.includes('\n') && /^\*\*[^*]+\*\*[.:?!]?$/.test(p);
  const isHeading = p => !p.includes('\n') && (/^#{2,6}\s/.test(p) || (isBoldLine(p) && (stripMd(p).length <= 45 || /^Q\d*[.:]/.test(stripMd(p)))));
  while (paras2.length && isHeading(paras2[paras2.length - 1])) paras2.pop(); // 본문 없이 끝에 남은 홍보 소제목 제거
  const mdHeadings = paras2.filter(p => /^#{2,6}\s/.test(p)).length;
  const boldLines = paras2.filter(p => isBoldLine(p) && !/^#{2,6}\s/.test(p)).length;
  const headings = paras2.filter(isHeading).map(stripMd);
  const bodyParas = paras2.filter(p => !isHeading(p));
  const bodyText = bodyParas.map(stripMd).join('\n');
  const bodyChars = bodyText.replace(/\n/g, '').length;

  const headForm = h => /^Q\d*[.:]/.test(h) || /[?？]$|까$|까\?$|까요|일까|을까|다를까|뭘까/.test(h) ? '질문' : /^\d+[.)]|^\[\s*\d+\s*\]|^STEP|^\d+\s|^#\d|^[①-⑩]|^(첫|두|세|네)번째/.test(h) ? '숫자리스트' : /(다|요|죠|니다)[.!]?$/.test(h) ? '문장' : '명사';
  // 도입부(리드) = 첫 소제목 앞까지의 본문 글자수
  const firstHeadIdx = paras2.findIndex(isHeading);
  const leadChars = (firstHeadIdx < 0 ? bodyParas.slice(0, 3) : paras2.slice(0, firstHeadIdx)).map(stripMd).join('').replace(/\n/g, '').length;
  const hf = { 질문: 0, 숫자리스트: 0, 문장: 0, 명사: 0 };
  headings.forEach(h => hf[headForm(h)]++);

  const numbers = (bodyText.match(/\d[\d,.]*/g) || []).length;
  const blockQuotes = bodyParas.filter(p => /^>/.test(p)).length;
  const dq = (bodyText.match(/[“"][^“”"]{2,}[”"]/g) || []).length;
  const boldSpans = bodyParas.reduce((n, p) => n + (p.match(/\*\*[^*]+\*\*/g) || []).length, 0);
  const summary = paras2.some(p => isHeading(p) && /(정리|요약|배운|핵심 인사이트|시사점|교훈|Outro|마치며|맺으며|맺음말|에필로그|결론|TL;DR|한 눈에|정리하면|핵심 포인트|핵심 요약|배운 점|레슨|인사이트|조언)/i.test(stripMd(p)));
  const toc = paras2.some(p => /한 눈에 보기|목차/.test(stripMd(p)));
  const fp = (bodyText.match(/(^|[^가-힣])(저는|제가|저도|저희|필자|나는|내가|우리는|우리가|저의|제 생각)/g) || []).length;
  const tp = (bodyText.match(/(그는|그녀는|그가|그의 |님은|님이 |님의 )/g) || []).length;
  const ends = { 해요: 0, 합쇼: 0, 평어: 0 };
  for (const m of bodyText.matchAll(/([가-힣]{1,3})[.!?]/g)) {
    const w = m[1];
    if (/(니다|니까)$/.test(w)) ends.합쇼++;
    else if (/(요|죠)$/.test(w)) ends.해요++;
    else if (/(다|가|나|까|지|네|군|라|자)$/.test(w)) ends.평어++;
  }
  const sentences = (bodyText.match(/[.!?](\s|$)/g) || []).length;
  const listBlocks = bodyParas.filter(p => /^(\d+\.|-|•)\s/m.test(p)).length;
  const firstPara = stripMd(bodyParas[0] || '');
  const lastPara = stripMd(bodyParas[bodyParas.length - 1] || '');
  return {
    n: idx, title, titleChars: title.length, titleDigit: /\d/.test(title) ? 1 : 0, titleLatin: /[A-Za-z]/.test(title) ? 1 : 0,
    ...TITLE[idx], intro: INTRO[idx], outro: OUTRO[idx], form: FORM[idx], leadChars,
    bodyChars, paras: bodyParas.length, avgPara: Math.round(bodyChars / Math.max(1, bodyParas.length)),
    headings: headings.length, mdHeadings, boldLines, hf, headingsList: headings, qa: headings.filter(h => /^Q\d*[.:]/.test(h)).length,
    numbers, numPer1k: +(numbers / bodyChars * 1000).toFixed(1), blockQuotes, dq, boldSpans, summary: summary ? 1 : 0, toc: toc ? 1 : 0,
    fp, tp, ends, sentences, avgSent: Math.round(bodyChars / Math.max(1, sentences)), listBlocks,
    firstChars: firstPara.replace(/\n/g, '').length, firstPara, lastPara, lastChars: lastPara.replace(/\n/g, '').length,
    dropped, bodyParas: bodyParas.map(stripMd),
  };
}

const R = blocks.map((b, i) => parse(b, i + 1));

const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rng = a => `${Math.min(...a)}~${Math.max(...a)}`;
const pct = o => { const t = o.해요 + o.합쇼 + o.평어 || 1; return `${Math.round(o.해요 / t * 100)}/${Math.round(o.합쇼 / t * 100)}/${Math.round(o.평어 / t * 100)}`; };
const dom = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
const person = r => r.fp >= 5 ? '1인칭혼합' : '3인칭';

if (mode === 'dump') {
  for (const r of R) {
    console.log(`\n===== #${r.n} ${r.title} (본문 ${r.bodyChars}자, 문단 ${r.paras})`);
    console.log('[버린 줄]', r.dropped.join(' | '));
    console.log('[소제목]', r.headingsList.join(' || '));
    console.log('[도입1]', r.bodyParas[0]?.slice(0, 300));
    console.log('[도입2]', r.bodyParas[1]?.slice(0, 200));
    console.log('[끝-2]', r.bodyParas[r.bodyParas.length - 3]?.slice(0, 200));
    console.log('[끝-1]', r.bodyParas[r.bodyParas.length - 2]?.slice(0, 200));
    console.log('[끝]', r.lastPara.slice(0, 400));
  }
} else if (mode === 'json') {
  console.log(JSON.stringify(R.map(({ dropped, bodyParas, ...r }) => r), null, 1));
} else if (mode === 'body') {
  const n = +process.argv[3]; console.log(R[n - 1].bodyParas.join('\n\n'));
} else {
  console.log('| # | 형식 | 제목자 | 제목숫자 | 주인공 | 본문자 | 문단 | 문단평균 | 소제목(md) | 굵은줄 | Q수 | 소제목형(질/숫/문/명) | 숫자수 | /1k | 인용블록 | 따옴표 | 굵게 | 요약절 | 리드자 | 도입유형 | 마무리 | 1인칭표지 | 해요/합쇼/평어% |');
  console.log('|' + '---|'.repeat(23));
  for (const r of R) {
    const hfS = r.headings ? `${dom(r.hf)}(${r.hf.질문}/${r.hf.숫자리스트}/${r.hf.문장}/${r.hf.명사})` : '-';
    console.log(`| ${r.n}${r.n === 12 ? '★' : ''} | ${r.form} | ${r.titleChars} | ${r.arab ? 'Y' : r.result ? '한글' : 'N'} | ${r.hero ? 'Y' : 'N'} | ${r.bodyChars.toLocaleString()} | ${r.paras} | ${r.avgPara} | ${r.mdHeadings} | ${r.boldLines} | ${r.qa} | ${hfS} | ${r.numbers} | ${r.numPer1k} | ${r.blockQuotes} | ${r.dq} | ${r.boldSpans} | ${r.summary ? 'Y' : 'N'} | ${r.leadChars} | ${r.intro} | ${r.outro} | ${r.fp} | ${pct(r.ends)} |`);
  }
  const rest = R.filter(r => r.n !== 12), z = R[11];
  const stat = (label, f, fmt = x => x) => {
    const all = R.map(f), rs = rest.map(f);
    console.log(`| ${label} | ${fmt(med(all))} | ${fmt(rng(all))} | ${fmt(med(rs))} | ${fmt(z ? f(z) : '-')} |`);
  };
  console.log('\n| 항목 | 중앙값(30) | 범위(30) | 중앙값(#12 제외) | #12 |');
  console.log('|---|---|---|---|---|');
  stat('제목 글자수', r => r.titleChars);
  stat('본문 글자수', r => r.bodyChars);
  stat('문단 수', r => r.paras);
  stat('문단당 평균 글자', r => r.avgPara);
  stat('소제목 수(md ##)', r => r.mdHeadings);
  stat('소제목 수(md + 짧은 굵은 줄)', r => r.headings);
  stat('굵은 한 줄(풀쿼트·소제목 겸용)', r => r.boldLines);
  stat('리드(첫 소제목 앞) 글자', r => r.leadChars);
  stat('본문 숫자 개수', r => r.numbers);
  stat('숫자/1,000자', r => r.numPer1k);
  stat('인용 블록', r => r.blockQuotes);
  stat('따옴표 인용', r => r.dq);
  stat('굵게 강조', r => r.boldSpans);
  stat('도입 문단 글자', r => r.firstChars);
  stat('마지막 문단 글자', r => r.lastChars);
  stat('문장 수', r => r.sentences);
  stat('문장당 평균 글자', r => r.avgSent);
  stat('리스트 블록 수', r => r.listBlocks);
  const cnt = (label, f) => console.log(`| ${label} | ${R.filter(f).length}/30 | #12: ${f(z) ? 'Y' : 'N'} |`);
  console.log('\n| 항목 | 해당 건수 | #12 |');
  console.log('|---|---|---|');
  cnt('형식 = 인터뷰 Q&A', r => r.form === '인터뷰QA');
  cnt('형식 = 서술 케이스', r => r.form === '서술케이스');
  cnt('형식 = 큐레이션(여러 사례)', r => r.form === '큐레이션');
  cnt('형식 = 에세이·개념설명·인물분석', r => /에세이|개념|인물/.test(r.form));
  cnt('Q. 소제목 3개 이상', r => r.qa >= 3);
  cnt('제목에 아라비아 숫자', r => r.titleDigit);
  cnt('제목에 성과 숫자(한글 수사 포함)', r => r.result);
  cnt('제목에 성과 숫자(아라비아)', r => r.arab);
  cnt('제목에 주인공(사람·회사) 이름', r => r.hero);
  cnt('제목에 라틴 문자(제품·용어)', r => r.titleLatin);
  cnt('본문 3,000~6,000자', r => r.bodyChars >= 3000 && r.bodyChars <= 6000);
  cnt('본문 6,000자 초과', r => r.bodyChars > 6000);
  cnt('본문 3,000자 미만', r => r.bodyChars < 3000);
  cnt('소제목 있음', r => r.headings > 0);
  cnt('소제목 3개 이상', r => r.headings >= 3);
  cnt('소제목에 숫자리스트형 있음', r => r.hf.숫자리스트 > 0);
  cnt('소제목에 질문형 있음', r => r.hf.질문 > 0);
  cnt('요약·정리 절 있음', r => r.summary);
  cnt('목차(한 눈에 보기) 있음', r => r.toc);
  cnt('인용 블록 1개 이상', r => r.blockQuotes > 0);
  cnt('인용(블록+따옴표) 3개 이상', r => r.blockQuotes + r.dq >= 3);
  cnt('숫자 밀도 5/1k 이상', r => r.numPer1k >= 5);
  cnt('숫자 밀도 10/1k 이상', r => r.numPer1k >= 10);
  cnt('굵게 강조 5회 이상', r => r.boldSpans >= 5);
  cnt('리스트 블록 있음', r => r.listBlocks > 0);
  cnt('문단 평균 200자 이하', r => r.avgPara <= 200);
  cnt('문단 평균 150자 이하', r => r.avgPara <= 150);
  cnt('첫 문단 200자 이하', r => r.firstChars <= 200);
  cnt('첫 문단 100자 이하', r => r.firstChars <= 100);
  cnt('리드(첫 소제목 앞) 600자 이하', r => r.leadChars <= 600);
  cnt('도입 = 결과제시(주인공+성과 한 줄)', r => r.intro === '결과제시');
  cnt('도입 = 인사·예고', r => r.intro === '인사·예고');
  cnt('도입 = 시사', r => r.intro === '시사');
  cnt('도입 = 장면', r => r.intro === '장면');
  cnt('도입 = 통념반박·반전명제(가이드 H2/H3)', r => /통념|반전/.test(r.intro));
  cnt('도입 = 질문제기·자기소개', r => /질문|자기/.test(r.intro));
  cnt('마무리 = 배운점정리(E2)', r => r.outro === '배운점정리');
  cnt('마무리 = 결론명령(E1, 인터뷰이 조언 포함)', r => /결론명령/.test(r.outro));
  cnt('마무리 = 열린질문·전망(E3)', r => /열린/.test(r.outro));
  cnt('마무리 = 기타(소회·응원·인터뷰 답변)', r => /기타/.test(r.outro));
  cnt('마무리 = 홍보', r => r.outro === '홍보');
  cnt('첫 문단에 숫자 있음', r => /\d/.test(r.firstPara));
  cnt('첫 문단에 주인공·회사 이름 있음(수동)', r => [3,4,5,7,10,11,14,15,16,18,19,22,24,25,30,9,2].includes(r.n));
  cnt('1인칭 표지 5회 이상', r => r.fp >= 5);
  cnt('해요체 우세', r => dom(r.ends) === '해요');
  cnt('합쇼체 우세', r => dom(r.ends) === '합쇼');
  cnt('평어체 우세', r => dom(r.ends) === '평어');
}
