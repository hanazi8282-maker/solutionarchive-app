# /library 카드 썸네일 — Atria 재실측과 통일 스펙

- 날짜: 2026-09-27 · 작성: CEO-STAFF 위임 서브에이전트(실측 전용, 코드 미수정)
- 실측 도구: Chrome(claude-in-chrome) `getComputedStyle` / `getBoundingClientRect` + 이미지 픽셀 스캔(OffscreenCanvas) + 스크린샷
- 실측 환경: 뷰포트 1536×674 CSS px(DPR 1.25). 1300px 리사이즈는 창이 최대화 상태라 적용되지 않았다 — 아래 수치는 전부 1536 기준이고, 비율(%)로 적어 폭에 무관하게 쓴다.
- 증거 파일(이 폴더): `thumb-atria-grid-1536.jpg` · `thumb-atria-card-vayner-zoom.png` · `thumb-atria-detail-hero.jpg` · `thumb-before-library-top.jpg` · `thumb-before-content-goblin-juttu.jpg` · `thumb-before-cydoc-fathom.jpg` · `thumb-before-plausible-testimonial.jpg` · `thumb-before-superhuman-slack.jpg` · `thumb-before-detail-hero-fathom.jpg` (도구가 JPG로 저장한다. PNG는 줌 1장뿐)

표기: **[실측]** = 이번에 브라우저·픽셀에서 읽은 값 · **[추정]** = 스크린샷 눈대중 또는 계산 · **[파생]** = Atria에 대응물이 없어 가장 가까운 실측값에서 끌어낸 값.

---

## §1 판정 — Atria 를 실제로 재유도한 적이 있나

**없다. 현재 썸네일 수치(16:7 · 로고 인셋 22%/56% · hue 공식 · 병목별 색)는 어느 하나도 Atria 에서 읽은 값이 아니다.**

근거:
1. 리포에 있는 유일한 "Atria 실측"은 `reports/2026-09-23/ui-overhaul-reference-plan.md` 78행 한 문장이고 크기·비율·색이 없다. 그 문장조차 틀렸다 — "위에 'CASE STUDY' 핑크 라벨"이라 적었지만 실물은 **썸네일 아래** 메타 줄에 있다(§2.5).
2. `app/_pub/pub.css` 764~773행의 `aspect-ratio: 16 / 7`, `inset: 22%; width: 56%`, `lib/cases/logo.ts` 의 `hsl(h 62% 46%) → hsl(h+28 68% 34%)`·`BOTTLENECK_HUE` 는 주석에 "[A]"·"§4 Atria 방식"이라 적혀 있을 뿐 출처 수치가 없다. Atria 실물은 16:9 · 로고 없는 카드 없음 · 병목/카테고리별 색 없음(브랜드 색)이다.
3. 그 결과가 CEO 가 본 세 가지 얼굴이다: 이니셜만(Content Goblin·Juttu), 띠 한가운데 뜬 작은 아이콘(Fathom·Plausible·Slack·Superhuman·Testimonial.to), 어색하게 뜬 작은 사진(Cydoc). 게다가 15장 중 8장이 같은 주황(병목 UNIT_ECONOMICS = hue 25)이라 "병목별 색"이 그리드에서는 벽지처럼 보인다.

---

## §2 Atria 실측 (https://www.tryatria.com/customers · 상세 https://www.tryatria.com/customers/ipsy-atria-case-study)

### 2.1 그리드·카드 껍데기
- 그리드 3열 × 394.7px, 열 간격 16px, 행 간격 40px, 컨테이너 1216px (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-10`) **[실측]**
- 카드에 테두리·패딩·배경 없음. 구조 = 썸네일 → 16px → 메타(`flex-col gap-3`) **[실측]**
- 카드 hover: 썸네일 이미지만 `scale(1.02)` 300ms **[실측]**

### 2.2 썸네일 박스
- 394.7 × 222 px = **16:9**(`aspect-video`) **[실측]**
- `border-radius: 24px`(`rounded-3xl`), `overflow: hidden` **[실측]**
- 내용물은 **`<img>` 한 장**(`object-fit: cover`). 듀오톤·로고 플레이트·흰 로고가 전부 이미지 안에 구워져 있다. CSS 오버레이·blend·filter 0개 **[실측]**
- 제공 이미지: srcset 640×365(카드), 원본 1920×1096. 상세 히어로도 같은 파일 **[실측]**

### 2.3 이미지 안의 구성(픽셀 스캔 8장 + 스크린샷)
- 배경 = 제품/작업 사진에 **브랜드 1색 단색 틴트**(모노톤 듀오톤). 8장의 전체 평균 HSL **[실측]**:
  Ipsy 320°/43%/70% · VaynerCommerce 201°/31%/49% · Blenders 239°/22%/54% · Kitsch 28°/35%/71% · Rubix 270°/7%/49% · SelfMade 235°/21%/56% · Orbitkey 0°/0%/54% · Alpha Inbound 240°/1%/38%
  → 채도 20~45%, 명도 38~71% 범위의 **중간톤 파스텔**. 우리 현재 띠(채도 62~68%, 명도 34~46%)보다 연하고 밝다.
- **플레이트**(로고 받침): 중앙, **폭 75% × 높이 33%** 의 가로 직사각형 **[실측]** — 스크린샷 300/401 = 74.8%, 74/227 = 32.6%; 4장 평균 픽셀 분산 스캔 x 13.8%→86.9%, y 33.7%→66.6%. 8장 전부 같은 자리·같은 크기(템플릿).
- 플레이트 색 = **배경과 같은 hue 의 채도 높은 단색, 반투명** — 사진 질감이 희미하게 비친다 **[실측]**. 배경보다 밝은 쪽도(Vayner 125,189,225 vs 62,106,130) 어두운 쪽도(Ipsy 213,115,180 vs 218,160,199) 있다 = 브랜드 색 그대로. 불투명도 **약 85~90% [추정]**.
- 플레이트 모서리 **약 4~6px(폭의 1.5%) [추정, 줌 스크린샷]**, 그림자·테두리 **없음 [실측, 줌]**.
- 로고 = **순백**(8장 모두 RGB 253~255) **[실측]**. 크기: 높이가 플레이트 높이의 47~59%(AGS 44/74, IPSY 36/76) = 썸네일 높이의 **16~20%** **[실측]**; 가로 워드마크는 플레이트 폭의 최대 89%(Vayner 267/300) **[실측]**.
- 썸네일 위 라벨·칩 **없음 [실측]**.

### 2.4 로고/사진 없는 카드
- 9장 전부 사진+로고 이미지가 있다. **이니셜만·로고만·사진만 케이스는 Atria 에 존재하지 않는다 [실측]**. §3 의 (b)·(c)는 파생이다.

### 2.5 썸네일 아래 메타
- `CASE STUDY` 칩: 높이 25px, 좌우 패딩 10px, 반경 12px, 배경 rgb(247,114,255), 글자 검정 **[실측]** · 옆에 날짜 14px rgb(126,126,126) **[실측]** · 제목 · 2줄 발췌.

### 2.6 상세 히어로
- 같은 이미지를 **1216 × 500(2.43:1)** 로 `object-cover` 크롭, `border-radius: 10px`, 제목·저자 아래에 배치 **[실측]**. 플레이트는 크롭 후에도 폭 75%(742/992) **[실측]**.
- 상세 하단 "관련 케이스" 카드는 별도 스타일: 이미지 높이 180px(2.18:1), 카드 `rounded-xl` 12px + 1px 테두리 **[실측]**.

---

## §2b 우리 현재값 (https://solutionarch.vercel.app/library · 로그인 벽 없음, 승인 카드 15장 렌더)

- 그리드 **2열** × 386px, 간격 20px, 컨테이너 792px(사이드바 필터 옆) **[실측]** — Atria 3열과 다르지만 이 문서 범위 밖.
- 카드: 패딩 24px, 반경 20px, 테두리 0.8px #e6e6e6, 내부 gap 12px **[실측]**
- 띠(`.pub-logo--cover`): 336.4 × 147.2 = **16:7**, 반경 12px, `linear-gradient(135deg, hsl(h 62% 46%), hsl(h+28 68% 34%))`, 이니셜 40px/600 흰색 **[실측]**
- 이미지 박스 inset 22% → 188×82px. 정사각 아이콘은 82×82 로 그려짐 = **띠 폭의 24%, 높이의 56%** **[실측]**
- Brandfetch 아이콘 128×128: 자기 배경판을 가진 것(Testimonial.to 파랑·Superhuman 보라·Slack 흰 사각·Fathom 노랑)과 투명 배경(Plausible 보라 로고가 주황 띠 위 = 대비 불량)이 섞여 있다 **[실측, 스크린샷]** — "로고마다 다른 얼굴"의 직접 원인.
- Cydoc: `/case-art/*.jpg` 350×350 사진이 82px 로 축소돼 띠 가운데 떠 있음 **[실측]**
- hue 분포 15장: 25° ×7, 330° ×4, 195° ×3, 45°·160°·210° ×1 **[실측]** → 절반이 주황.
- 상세 히어로(`.pub-logo--lg`): 72×72, 반경 12px, 이니셜 28px, 제목 왼쪽 **[실측, 스크린샷]**

---

## §3 통일 썸네일 시스템 (Atria 실측에서 유도)

원칙 하나: **띠(band) + 플레이트(plate) 두 층. 플레이트는 항상 있고 내용만 바뀐다(아이콘 / 이니셜). 사진은 띠의 배경이 될 뿐 층을 늘리지 않는다.** 세 케이스가 한 얼굴이 되는 이유가 이것이다.

### 3.0 공통
| 항목 | 값 | 출처 |
|---|---|---|
| 띠 비율 | **16:9** (336px 폭 → 189px) | Atria `aspect-video` [실측]. 현 16:7 은 출처 없음 |
| 띠 반경 | **12px 유지** | Atria 24px 은 테두리·패딩 없는 카드의 값 [실측]. 우리는 반경 20px 카드 안 24px 패딩 → 동심 반경 규칙(내부 ≤ 외부−패딩)상 24px 은 과하다 [파생] |
| 띠 색 | `linear-gradient(135deg, hsl(H 40% 60%), hsl(H 36% 46%))` | Atria 틴트 채도 20~45%·명도 38~71% 의 안쪽 [실측→파생]. 135° 방향은 Atria 대응물 없음(사진) [추정] |
| 플레이트 크기 | 높이 = **띠 높이의 33%**(189px 띠 → 62px). 폭 = 내용 + 패딩, **최소 = 높이(정사각), 최대 = 띠 폭의 75%** | Atria 75%×33% [실측]. Atria 는 워드마크라 항상 최대폭이고, 우리 아이콘은 정사각이라 최소폭이 된다 — 규칙은 하나 |
| 플레이트 색 | **흰색 `#fff` 불투명** | Atria 는 브랜드색 플레이트+흰 로고 [실측]. 우리는 남의 컬러 래스터 아이콘을 흰색으로 못 바꾸므로 뒤집는다 — 대비 보장은 흰 판이 유일 [파생] |
| 플레이트 반경 | **8px** | Atria 약 4~6px [추정] + 우리 토큰 계열 |
| 플레이트 패딩 | **플레이트 높이의 20%**(62px → 12px) → 내용 높이 60% = 37px | Atria 로고 높이 = 플레이트 47~59% [실측] |
| 플레이트 그림자 | 없음. 아이콘이 흰색에 가까울 때 대비용 `box-shadow: inset 0 0 0 1px rgb(0 0 0 / .06)` 하나만 | Atria 그림자 없음 [실측]; inset 선은 파생 |
| 내용 높이 (띠 대비) | 37/189 = **20%** | Atria 로고 = 썸네일 높이 16~20% [실측] |

### 3.1 (a) 로고 있음 (brand_domain → Brandfetch/Google)
- 띠: 3.0 그라디언트(팔레트 색, 3.2). 플레이트 62×62 정사각, 아이콘 37×37 `object-fit: contain` 중앙.
- Brandfetch 가 자기 배경판을 붙여 오는 아이콘(Slack·Testimonial.to)도 흰 판 안에 들어가면 "판 안의 판"이지만 크기·자리가 같아 한 얼굴로 읽힌다. 워드마크(`type=logo`) 전환은 §5 Q1.
- 폴백 사다리는 그대로: Brandfetch 404 → Google 파비콘 → 둘 다 실패면 `<img>` 제거 → 플레이트 안에 **이니셜**이 보인다 = (b)와 동일한 그림. 지금은 실패 시 띠 한가운데 흰 이니셜, 성공 시 아이콘이라 두 얼굴이었다.

### 3.2 (b) 로고 없음 → 이니셜 (Atria 대응물 없음, 파생)
- 같은 플레이트(62×62 흰색) 안에 **이니셜 1자**, 색 = 띠 hue 의 진한 톤 `hsl(H 45% 38%)`, 굵기 600, **font-size 40px**(캡 높이 ≈ 29px ≈ 플레이트 47%, Atria 하한) [파생]. 흰 띠 위 흰 글자가 불가능하므로 색을 뒤집었다 — 플레이트를 없애고 띠에 흰 이니셜을 그리는 대안은 (a)와 다른 얼굴이 되어 기각.
- **띠 색 팔레트 — 고정 6색, hue 값** (Atria 8장 실측 hue 에서 채택, 채도·명도는 3.0 공식):
  `[320, 201, 239, 28, 270, 160]` — 앞 5개는 Atria 실측(Ipsy·Vayner·Blenders·Kitsch·Rubix), 160 은 회색 2장(Orbitkey·Alpha, 채도 0)을 대신할 한 칸 — 회색 띠는 흰 플레이트와 대비가 안 나와 초록 계열로 채웠다 [파생].
- **순환 키 = `slug` 문자열 해시 mod 6** (`duotoneHue` 의 해시 그대로, 입력만 brand_name → slug).
  - 목록 인덱스 순환(i mod 6)은 이웃 카드가 반드시 다르지만 정렬·필터·페이지가 바뀔 때마다 같은 케이스의 색이 바뀌고, 카드·저장함·상세 히어로에서 서로 다른 색이 된다 — CEO 불만이 "일관성"이므로 기각.
  - 해시는 어디서나 같은 색. 이웃 충돌 확률 1/6 은 감수한다(Atria 도 이웃 색을 통제하지 않는다 — 1행에 초록·핑크·파랑, 2행에 보라·베이지·회색 [실측]).
  - brand_name 이 아니라 slug 인 이유: brand_name 은 편집으로 바뀔 수 있고 빈 값('?')이 있다. slug 는 라우트 키라 불변.
- **병목별 색(`BOTTLENECK_HUE`)은 폐기 권고.** 실측상 15장 중 7장이 hue 25 로 몰렸고, Atria 는 카테고리로 색을 묶지 않는다(브랜드색). "같은 병목이 같은 색으로 묶여 보인다"는 이점은 이미 병목 칩이 글자로 하고 있다. 단 `scripts/case-detail-selftest.mjs` 190~191행 두 검사가 이 함수에 묶여 있어 같이 고쳐야 한다(§4).

### 3.3 (c) 사진 있음 (`logo_url` 이 `/case-art/…`)
- 사진이 **띠 전체를 채운다** `object-fit: cover`(Atria 배경 = 사진 [실측]).
- 틴트: `filter: grayscale(1)` + 그 위에 `hsl(H 45% 60% / .62)` 오버레이 한 겹 → Atria 의 모노톤 파스텔(명도 38~71%)에 근사 [파생]. blend-mode 를 쓰지 않는 이유: `isolation` 부작용 없이 한 줄로 끝난다.
- 그 위에 **같은 플레이트를 같은 자리(중앙)에** — Atria 도 사진 위 중앙 플레이트다 [실측]. 플레이트 내용 = (a)/(b) 규칙 그대로(이 7건은 brand_domain 이 없으므로 전부 이니셜).
- 스크림 불필요: 대비는 흰 플레이트가 담당하고, 띠 위에는 글자가 없다. Atria 도 스크림 없음 [실측].
- 사진이 못 읽히면(404) `<img>` 가 빠지고 3.0 그라디언트 띠가 남는다 — 깨진 그림 아이콘이 안 뜨는 현재 방식 유지.

### 3.4 상세 히어로·인라인(size lg/md)
- `lg` 72px · `md` 56px 는 **플레이트만** 그린다(띠 없음): 흰 배경, 반경 12px/8px, `inset 1px` 선, 내용은 (a)/(b) 규칙. 카드의 플레이트를 확대한 것과 같은 물체가 되어 "카드는 아이콘, 상세는 이니셜" 갈림이 원천 차단된다. Atria 는 히어로에 같은 이미지를 쓴다 [실측] — 같은 원칙(같은 물체).
- Atria 식 1216×500 히어로 배너는 만들지 않는다(사진이 7건뿐, 나머지는 빈 띠가 된다).

### 3.5 요약 숫자표
| | 띠 | 플레이트 | 내용 |
|---|---|---|---|
| (a) 로고 | 16:9 · 12px · 팔레트 그라디언트 | 62×62(폭 최대 252) · #fff · 8px · 패딩 12px | 아이콘 37px contain |
| (b) 이니셜 | 동일 | 동일 | 이니셜 40px/600 `hsl(H 45% 38%)` |
| (c) 사진 | 동일 + 사진 cover + grayscale + 62% 틴트 | 동일 | (a) 또는 (b) |
| lg/md | 없음 | 72/56px · #fff · 12/8px | 아이콘 60%/이니셜 28px·20px |

---

## §4 구현 메모 (Opus 용)

**손대는 파일 3개, 마이그레이션 0건.**

1. `lib/cases/logo.ts`
   - `LogoVerdict` 에 `kind: 'photo'` 추가. 판정: `safeImageUrl(logo_url)` 이 `/case-art/` 로 시작하면 `photo`, 그 외 절대주소/경로는 기존 `url`. **접두사 규칙을 권고**(컬럼 추가 대신).
     - 근거: 해당 행이 7건이고 전부 `public/case-art/*.jpg`(파일 목록 확인: cydoc·fab-com·homejoy·pets-com·shyp·zenefits·zume). 마이그레이션·백필·`case_studies` 타입 재생성이 0. 폴더 이름 자체가 "art"(로고 아님)라 의미가 경로에 이미 있다.
     - 대가: 규약이 데이터가 아니라 경로에 숨는다. 누군가 진짜 로고를 `/case-art/` 에 넣으면 사진 취급된다 → `logo.ts` 헤더 주석 + selftest 한 줄(`/case-art/x.jpg → photo`, `/logos/x.png → url`)로 막는다. 세 번째 출처(예: 사용자 업로드 로고)가 생기면 그때 `logo_kind` 컬럼으로 승격 — 지금은 YAGNI.
   - `duotoneHue(bottleneck, brandName)` → `paletteSlot(slug): 0..5`(slug 해시 mod 6). `hue` 필드 대신 `slot` 을 내린다. `LogoInput` 에 `slug` 추가(카드·상세 모두 이미 갖고 있다).
   - `scripts/case-detail-selftest.mjs` 190~191행("병목이 같으면 색도 같다", "브랜드명 해시") 은 새 규칙으로 교체: 같은 slug 같은 slot · 다른 slug 는 0..5 안 · 결정적.
2. `app/_pub/components/PubBrandLogo.tsx`
   - 마크업: `<span class="pub-logo pub-logo--cover pub-logo--s{slot} [pub-logo--photo]">` → `[photo img]` → `<span class="pub-logo-plate">{initial}[LogoImg]</span>`.
   - 이니셜을 플레이트 안에 두고 `LogoImg` 를 그 위에 절대배치하면 **현재 폴백 사다리(Brandfetch→Google→null)가 그대로 동작**한다: 이미지가 사라지면 밑의 이니셜이 드러난다. `LogoImg` 는 건드리지 않는다.
   - 인라인 style(`--pub-logo-hue`) 삭제 가능 — 슬롯이 6개 고정이면 클래스로 끝나서 "인라인 스타일 금지의 유일한 예외"가 없어진다. `pub.css` 에 `.pub-logo--s0…s5 { --pub-band-h: 320 }` 식으로 hue 만 두고 공식은 `.pub-logo` 한 곳.
   - `app/_ds/components/BrandLogo.tsx`(내부 화면) 도 `logoFor` 의 `hue` 를 읽는다(20·36행). `slot` 으로 같이 바꾸거나, 과도기엔 `hue: PALETTE[slot]` 을 함께 내려 깨지지 않게 한다.
3. `app/_pub/pub.css` 743~773행 교체 — 위 3.0~3.4 값. `aspect-ratio: 16 / 9`, 플레이트 `height: 33%; min-width: calc(33% * 16 / 9)`… 는 %가 축이 달라 계산이 꼬이므로 **`container-type: size` + `cqh`** 를 쓰거나(플레이트 `height: 33cqh; min-width: 33cqh; max-width: 75cqw; padding: 6.6cqh`), 간단히 데스크톱 고정 px(62/12/37)로 두고 모바일(375px, 띠 343×193)은 같은 px 로 두어도 비율이 거의 같다(플레이트 32%). **ponytail: px 고정 권고**, cqh 는 폭이 크게 달라지는 화면이 생길 때.

**깨뜨리면 안 되는 것**
- `LOGO_NOTICE` 와 `PubBrandLogoNotice` 사용처 4곳(`app/library/page.tsx`·`saved/page.tsx`·`[slug]/page.tsx` ×2) — 로고를 그리는 화면은 고지를 낸다. 마크업 바꿔도 이 export 는 유지.
- `LogoImg` 폴백 사다리와 `referrerPolicy="strict-origin-when-cross-origin"` — Brandfetch 는 Referer 필수.
- Brandfetch 핫링크 규칙(`logo.ts` 헤더): src 를 내려받거나 재호스팅하지 않는다. 흰 플레이트는 CSS 이지 이미지 가공이 아니므로 위반 아님. **(c)의 grayscale/틴트는 `/case-art/` 자체 호스팅 사진에만** 건다 — Brandfetch 아이콘에 filter 를 걸지 않는다(약관상 로고 변형 금지 소지).
- `<img>`(next/image 아님) — 외부 호스트 화이트리스트 문제, 그대로.
- 상세 히어로 `Hero.tsx` 의 `media` 슬롯은 `size="lg"` 를 그대로 받는다. 3.4 대로 플레이트만 그리면 `Hero` 는 수정 없음.
- `app/_pub/README.md` 토큰 표에 썸네일 행이 없다 — 이 문서(§3.5)를 출처 [A'] 로 한 줄 추가해 "임의 설정 재발"의 다음 고리를 끊는다.

**검증(구현 세션이 남길 것)**: `scripts/case-detail-selftest.mjs` 통과 · /library 에서 Content Goblin·Juttu(이니셜)·Fathom·Slack·Plausible(아이콘)·Cydoc(사진) 6장 스크린샷을 이 폴더 `thumb-after-*.jpg` 로 · 375px 에서 플레이트가 띠 밖으로 안 나가는지.

---

## §5 남헌 판단 필요

**Q1. Brandfetch 를 아이콘(`icon`) 대신 워드마크(`type=logo`, `theme=light`)로 바꿀까?**
- A) 아이콘 유지(권고): 정사각이라 플레이트가 항상 같은 크기, 폴백(Google 파비콘)도 정사각. 이번 스펙 그대로.
- B) 워드마크: Atria 와 가장 닮는다(가로 플레이트 75%). 대신 브랜드마다 폭이 달라지고, 워드마크가 없는 도메인은 404 → 파비콘(정사각)으로 떨어져 두 얼굴이 다시 생긴다. Google 폴백에는 워드마크가 없다.
- 권고 A. B 는 A 를 배포한 뒤 "워드마크 있는 도메인 비율"을 세어 보고 결정.

**Q2. 병목별 색 폐기 동의 여부.** §3.2 근거(15장 중 7장 동일색, Atria 는 카테고리 색 없음). 유지하고 싶으면 대안: 팔레트 6색을 병목 7종에 매핑하되 `UNIT_ECONOMICS` 비중이 커서 주황 벽은 그대로다 — 그래서 권고는 폐기.

**Q3. 사진 7건의 틴트 강도.** 62% 틴트 + grayscale 은 Atria 근사치이고 사진의 정보량을 많이 지운다(Atria 도 그렇다). 원 사진 색을 살리고 싶으면 grayscale 없이 틴트 40% — 다만 그러면 카드마다 사진 색이 튀어 통일감이 준다. 권고: 스펙대로(62%+grayscale), 배포 후 스크린샷 보고 한 번만 조정.

**Q4. 16:7 → 16:9 로 카드가 42px 커진다**(2열 그리드에서 한 화면 카드 수 감소). Atria 실측값이라 권고는 16:9. 화면 밀도가 더 중요하면 16:7 을 유지하되 "Atria 값 아님"을 README 에 적는다.
