# 독립 검증 — 2026-09-15-stanley-buy-guide.md

**판정: 수정 후 통과** — 지어낸 숫자·발언은 0건. 귀속 흐리기 2, 원문에 없는 합치기 1, 시점 빼기 2, 표지 떨어뜨리기 2, 범위 넓히기 2, 출처 미표기 1 = 10문장을 최소 수정으로 고쳤고, 판단이 갈리는 4건은 남헌 판단으로 남긴다.

검증자: 작가와 다른 에이전트. 작가의 조사 노트·자체 점검은 근거로 쓰지 않았다. 근거 URL 8개(메모 7 + ms.now 1)를 전부 `curl -A Mozilla` 로 원문 HTML 을 받아 태그를 벗긴 본문으로 문장 단위 대조했다. DB·커밋은 건드리지 않았다.

## 열어 본 URL

| URL | 결과 | 비고 |
|---|---|---|
| retaildive.com/news/stanley-quencher-tumblers-viral-success/699416/ | 열림(200) | Published Nov. 14, 2023 확인 |
| thebuyguide.com/home/the-story-of-the-cup/ | 열림(200) | 발행일 없음. 본문 "the last two years", "June 2020", "November 2020" |
| cnbc.com/2023/12/23/how-a-40-ounce-cup-turned-stanley-into-a-750-million-a-year-business.html | 열림(200) | Published Sat, Dec 23 2023 |
| money.com/changemakers/the-buy-guide/ | 열림(200) | **Published: Dec 8, 2022** (메모의 "미표기"를 정정) |
| foxbusiness.com/lifestyle/viral-video-lands-user-new-car-stanley-tumbler-withstands-fire | 열림(200) | November 18, 2023 |
| abc7.com/post/stanley-cup-fire-tumblers-viral-tiktok-videos/14082972/ | 열림(200) | November 20, 2023, "more than 60 million views" |
| marketingdive.com/news/whats-next-stanley-water-bottle-craze/746846/ | 열림(200) | **Published May 1, 2025** (메모의 "확인 불가"를 정정) |
| ms.now/know-your-value/out-of-office/secret-dramatic-rise-stanley-cup-women-rcna136290 | 열림(200) | 메모에 없던 URL. 본문 "다른 정리 글들은 2020년 1월"의 출처라 검증자가 열어 확인 |

403·열지 못함: 없음. "확인 불가"로 분류한 문장: 0.

## 대조 규모

- 본문 문장 138개 전부 읽음. 그중 사실·수치·발언·인과·시점·귀속이 들어간 문장 105개를 원문과 대조
- 걸린 문장 10개: 귀속 흐리기 2 · 원문에 없음(두 출처 합치기) 1 · 시점 빼기 2 · 표지 떨어뜨리기 2 · 범위 넓히기 2 · 출처 미표기 1
- 원문에 없는 숫자·발언(지어낸 것): 0

## 걸린 문장 전부

1. L40 「르쉬어 본인은 CNBC에 5,000개 발주라고 했고」 — **귀속 흐리기**(기자 서술을 본인 발언으로). CNBC 원문: "LeSueur tells CNBC Make It of her purchase order for 5,000 Quenchers." 5,000 은 기자 서술이고 르쉬어 인용문은 "I felt like I was signing a mortgage…" 뿐. → **수정함**: 「CNBC는 르쉬어의 발주를 5,000개로 적었고」
2. L40 「내바로는 리테일다이브에 최소 1만 개였으며 5,000개씩 나눠 나갔다고 설명했다」 — **귀속 흐리기**(기자 서술을 임원 발언으로). 리테일다이브 원문: "Instead, Stanley directed the women to place a wholesale order — with a minimum order quantity of 10,000 cups." / "The Buy Guide sold out of its first 5,000 cups in about four days. It sold through the second 5,000 cups in an hour." 둘 다 내바로 인용이 아니다. → **수정함**: 「리테일다이브는 최소 주문 수량이 1만 개였으며 5,000개씩 두 번에 걸쳐 팔렸다고 썼다」. 근거 메모에도 "(내바로 발언 아님)" 추가
3. L52 「두 번째 5,000개가 1시간 만에 나갔다는 점은 두 곳이 같다」 — **원문에 없음**(두 출처 합치기). 더 바이 가이드 원문: "So, we did it again. By ourselves. And sold them out AGAIN." — 두 번째 수량도 시간도 없다. 1시간은 리테일다이브 단독. → **수정함**: 「두 번째 5,000개가 1시간 만에 나갔다는 것은 리테일다이브 서술이고, 세 사람의 기록은 다시 완판시켰다고만 적었을 뿐 두 번째 수량과 시간은 적지 않았다」
4. L58 「로런이 회의에서 더 바이 가이드를 꺼낼 때마다 반대에 부딪혔다」 — **범위 넓히기**("때마다"). 원문: "Lauren got a lot of pushback when she brought up The Buy Guide in meetings." → **수정함**: 「꺼냈을 때 많은 반대에 부딪혔다」
5. L60 「다른 정리 글들은 2020년 1월로 적는다」 — **출처 미표기**(근거 메모에 URL 없음, 조사 노트에서만 "요약 도구로 확인"). 검증자가 ms.now 원문을 열어 확인: "In January of 2020, Solomon invited the women of The Buy Guide to speak to the executive team at a outdoor retail conference in Denver Colorado." → **수정함**: 「ms.now(구 NBC Know Your Value) 기사는 2020년 1월로 적는다」 + 근거 메모에 URL·인용 한 줄 추가
6. L28 「자기보고 데이터로는 팔로워의 97.7%가 여성이고」 — **시점 빼기**. 원문 현재형 "The Buy Guide's following is 97.7% women… according to data The Buy Guide shared with Retail Dive"(2023-11). 2019년 발주 시점 수치처럼 읽힐 자리(바로 앞 문단이 2019년 판단 서술). → **수정함**: 「자기보고 데이터(2023년 11월 기사 시점)로는」
7. L78 「누적 1,000만 개 이상 팔렸다」 — **시점 빼기**. 원문: "Stanley has now sold more than 10 million Quenchers"(2023-12-23). → **수정함**: 「2023년 12월 기사 시점 기준 누적 1,000만 개 이상 팔렸다」
8. L88 「제품은 바뀌지 않았다」 — **표지 떨어뜨리기**(작가도 검증자 확인 요청 지점으로 표시). 같은 CNBC 원문에 "In 2022, Stanley released a redesigned Quencher model" 이 있어 글 전체 범위에서는 거짓이 된다. 2019~2020 발주 구간에 한정하면 맞다. → **수정함(최소)**: 「이 구간에서 제품은 바뀌지 않았다」. 표지("이렇게 보면")까지 붙일지는 남헌 판단 ①
9. L102 「스탠리는 최소 주문 1만 개를 요구했다고 보도됐고, 그 금액은 세 사람의 사업 계좌를 비웠다」 — **범위 넓히기/합치기**. 계좌를 비운 것은 5,000개 발주다(CNBC: "her purchase order for 5,000 Quenchers… It took every penny that we had in the business account"; 더 바이 가이드: "buy 5,000 cups on our own… turned over all the money we had in our business account"). 1만 개 금액이 계좌를 비웠다는 문장은 어느 원문에도 없다. → **수정함**: 「첫 발주는 세 사람의 사업 계좌를 비웠다」
10. L104 「7,300만 달러에서 7억 5,000만 달러로 가는 구간은 새 사장과 100가지가 넘는 컬러와 회사의 투자가 만든 것이다」 — **표지 떨어뜨리기**(인과 해석을 사실처럼). CNBC 는 "With every new color Stanley rolled out, sales continued to increase", 더 바이 가이드는 "Stanley has caught the vision and invested a lot" 으로 나란히 놓았을 뿐 "만들었다"는 인과 확정은 없다. → **수정함**: 「이렇게 보면 7,300만 달러에서 … 만든 것이다」

근거 메모 정정 3건(본문 아님): 머니 발행일 2022-12-08, 마케팅다이브 발행일 2025-05-01, ms.now 한 줄 추가.

## 원문 일치로 확인한 주요 지점 (걸리지 않음)

- 제목·훅의 5,000개·5일·자기 돈: 더 바이 가이드 "buy 5,000 cups on our own… bought all the cups in 5 days… all the money we had in our business account plus some from each of our personal accounts"
- L8 2019년 재입고 중단: CNBC "by 2019 Stanley had stopped restocking and marketing the product"
- L12 2017년 11월 게시물·문구: 리테일다이브 "second post on Instagram, back in November 2017… 'Of all the insulated cups... this is the one. Just trust'" (칼럼의 "초기 게시물 중 하나"는 원문보다 약하게 쓴 것, 문제 없음)
- L16 허친슨 발언, L18 내바로 "no plans to discontinue… 'the tumbler wasn't prioritized at the time'", L26 "We KNEW this product was special…", L30 "As recently as 2012… 'a 30-year-career veteran policeman' and 'a retired Army soldier'", L34 에밀리 메이너드·로런 DM·"went to bat for us", L36 "Stanley had not participated in those programs at the time. Instead, Stanley directed the women to place a wholesale order", L38 CNBC "sales numbers weren't there. Instead, Stanley gave her another option", L44·L46·L48 인용 3건, L50 창고·풀필먼트·쇼피파이, L54 머니 "more than 165,000 followers… LeSueur says about 60,000 people a day", L60 리테일다이브 "Stanley executives reached out… flew them out to Colorado" / 더 바이 가이드 "she asked us if we could fly out to Denver… in 2019", L62·L64 인용, L66 제안 셋 "create a new site, join an affiliate platform, and… introduce them to an army of influencers", L70·L72 CNBC 라일리, L74 내바로 인용, L76 "June 2020… over 20,000 of you had a difficult time checking out… November 2020 launch… completely new web site and enhanced their customer service", L78 매출 수열 $73M/$94M/$194M/$402M/$750M projected·2020년 최다 판매 제품, L80 폭스 "nearly 60 million views… 'Still has ice in it'… 'we'd love to replace your vehicle'", L84 구매 이유 6가지·"Peloton, to work, to carpool", L102 마케팅다이브 "We're in year five of the virality" / 파이퍼샌들러 "top 5 fashion trend by female teens… also listed as a top 5 fashion trend that's on its way out", L104 "over 100 colors" — 전부 원문과 일치
- 인용문 번역은 전부 원뜻 유지. 의역 범위 안

## §10 점검표 (검증자 재작성)

0. 예 — 첫 줄 `독자: 창업자`, 할 일 셋이 창업자의 행동(고객 명단·다음 물량·재협상)
1. 예 — 옮길 것 셋 + 마무리 한 문장
2. 예 — 사실(발주·완판·매출) / 이유·조건 / 해결 과정(DM→발주→완판→덴버→재출시) / 사고의 흐름(더 바이 가이드 원문 한 문단) / 적용 전부 있음
3. 예 — 마무리가 구체 행동
4. 예 — 통하는 조건 4, 안 통하는 조건 5, 규모 차이 문단
5. 예 — 지어낸 숫자·발언 0. 걸린 것은 귀속·시점·표지·합치기였고 수정 완료
6. 예(수정 후) — L88·L104 를 고쳤다. "이렇게 보면"·"읽히는"·"우리 해석이다" 표지가 분석 문장에 붙어 있음
7. 예(수정 후) — L40 두 곳의 기자 서술을 매체 귀속으로 돌렸다. 나머지 자기보고(97.7%, 5일, 2만 명, 매출 수열)는 "제공한 자기보고 데이터", "세 사람의 기록", "CNBC가 검토한 데이터 기준" 으로 귀속됨
8. 예 — `---` 아래 `## 근거 메모`
9. 예(수정 후) — 원문에 있는 인과(제휴 미참여→도매 안내, 판매 숫자 부족→생산 유지 불가)만 인과로 썼고, L104 에 표지를 붙였다. L20 은 원래 "이렇게 보면" 있음
10. 예 — 팔로워 데이터는 더 바이 가이드 계정에 한정, 구매 이유는 "세 사람이 적은 이유"로 한정. L58 "때마다"만 줄였다
11. 예(수정 후) — 97.7%·1,000만 개에 기사 시점 추가. 16만 5,000명은 원래 "2022년 무렵"이었고 실제 발행일 2022-12-08 과 맞음. "바이럴 5년 차"는 2025-05 발언인데 본문에 연도 없음 → 남헌 판단 ④
12. 예 — 익명 취재원 없음. 7억 5,000만 달러는 "전망됐다"+단일 매체 한계 명시

## 남헌 판단 필요

① L88 「이 구간에서 제품은 바뀌지 않았다. 바뀐 것은 이 컵이 놓인 코너와 그걸 권하는 사람이었다.」 — 원문 사실의 요약이긴 하나 단정문. "이렇게 보면"을 붙일지, 지금처럼 둘지
② L96 「5,000개를 5일에 팔고 다음 5,000개를 1시간에 판 기록이 회의실에서 통한 것이지, 여성 시장이 크다는 주장이 통한 게 아니다」 — 더 바이 가이드 원문 "We wish we could say that they listened to us. The truth is more that the massive sales won them over" 가 받치지만, 같은 원문은 PMI CEO 의 지지("Without his interest and support around that conference table, Stanley may never have agreed to order more cups")도 결정 요인으로 적는다. 칼럼은 이 대목을 뺐다. 적용 절의 해석이라 그대로 둘지, CEO 지지를 한 줄 넣을지
③ L60 「전환점은 덴버의 아웃도어 리테일러 컨퍼런스였다」 — "전환점"은 해석. 원문 "the plan was finally in motion" 이 받치지만 확정 표현. 둘지 표지 붙일지
④ L102 「내바로는 "바이럴 5년 차"라고 말했고」 — 마케팅다이브 발행일이 2025-05-01 로 확인됐다. 본문에 "2025년"을 넣을지 (근거 메모에는 넣었다). 또 이 기사에서 내바로 직함은 "Global President" 인데 본문 L18 은 리테일다이브(2023) 기준 "글로벌 커머스 담당 수석부사장". 시점이 다르므로 그대로 둬도 되지만 확인해 둘 것
