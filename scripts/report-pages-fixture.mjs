// 가짜 결론서 픽스처 — **실제 결론서가 아니다.** 회사·인물·수치는 전부 지어낸 것이다.
// report-pages-selftest.mjs 와 로컬 렌더 확인(데스크톱·모바일 폭, 표 가로 스크롤, 글꼴 대체)에만 쓴다.
// 프로덕션·DB 에 올리지 않는다.
//
// 일부러 넣은 것: Google Fonts <link>(CSP 가 막아야 한다 → 시스템 글꼴로 대체), 넓은 표(가로 스크롤),
// 각주 링크 15개(새 탭으로 바뀌어야 한다), 위험 링크 3개(href 가 지워져야 한다).

const notes = Array.from({ length: 15 }, (_, i) => i + 1)

// <a> 23개 = 본문 각주 번호(#fn) 5 + 출처 링크 15 + 위험 링크 3.
export const FAKE_COUNTS = { anchors: 23, hashLinks: 5, sourceLinks: 15, dangerous: 3 }

export const FAKE_REPORT_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<title>가짜 결론서 — 예시전자(테스트)</title>
<style>
  body{font-family:'Noto Serif KR',serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.7;color:#222}
  h1{font-size:28px;line-height:1.3;margin:0 0 8px} .sub{color:#666;margin:0 0 24px}
  .wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #ddd}
  table{border-collapse:collapse;min-width:900px;font-size:14px} th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;white-space:nowrap}
  th{background:#f3f3f3} sup a{text-decoration:none} ol.notes{font-size:13px;color:#555}
</style></head>
<body>
<h1>가짜 결론서: 예시전자 무선 청소기 진입 판단 (셀프테스트용)</h1>
<p class="sub">작성 예시 · 모든 수치는 지어낸 값입니다</p>
<p>이 문서는 링크 재작성·격리 렌더를 확인하기 위한 가짜 문서다.${notes.slice(0, 5).map((n) => `<sup><a href="#fn${n}">${n}</a></sup>`).join('')}</p>
<div class="wrap"><table>
<thead><tr><th>항목</th><th>경쟁 A(가상)</th><th>경쟁 B(가상)</th><th>경쟁 C(가상)</th><th>경쟁 D(가상)</th><th>경쟁 E(가상)</th><th>비고</th></tr></thead>
<tbody>
${['흡입력 불만', '배터리 불만', '소음 불만', 'A/S 불만', '가격 불만'].map((r, i) => `<tr><td>${r}</td>${[1, 2, 3, 4, 5].map((c) => `<td>${(i + 1) * c * 3}%</td>`).join('')}<td>가상 표본 n=${100 + i}</td></tr>`).join('\n')}
</tbody></table></div>
<p>위험 링크 3개(지워져야 한다): <a href="javascript:alert(1)">js</a> · <a HREF=" data:text/html,<b>x</b>">data</a> · <a href="jav&#x09;ascript:alert(2)">obf</a></p>
<ol class="notes">
${notes.map((n) => `<li id="fn${n}"><a href="https://example.com/source/${n}?ref=fake&amp;n=${n}" target="_self">가상 출처 ${n}</a></li>`).join('\n')}
</ol>
</body></html>`
