import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubButtonLink } from '../_pub/components/Button'

// 개인정보 처리 안내(v71cq §2-1). 항목 순서는 개인정보 처리방침 작성지침(처리 목적 → 항목 → 보유 → 제3자 제공 → 위탁·국외이전 → 권리 → 파기·안전조치 → 문의)을 따랐다.
// 쉬운 말로 쓴 한 장이다. 코드가 실제로 하는 일(lib/consult/leads.ts)과 어긋나지 않게 고친다.
export const metadata = { title: '개인정보 처리 안내 — 솔루션아카이브', description: '무료 결론서 초안을 위해 받는 정보를 어디에 쓰고, 얼마나 보관하며, 어떻게 지우는지 안내합니다.' }

const S = ({ t, children }: { t: string; children: React.ReactNode }) => <Panel titleAs="h2" title={t}>{children}</Panel>

export default function Privacy() {
  return (
    <PubShell theme="light" footerNote="시행일 2026-11-17. 내용이 바뀌면 이 화면에서 먼저 알려 드립니다.">
      <div className="pub-solo">
        <Hero eyebrow="개인정보 처리 안내" title="받는 정보와 쓰는 곳" lead="무료 결론서 초안과 완성본을 만드는 데 필요한 것만 받습니다. 이 안내는 첫 화면의 신청 화면과 연결돼 있습니다." />
        <S t="1. 무엇을, 왜 받나요">
          <ul>
            <li className="pub-text"><b>서비스 주소</b> — 공개된 페이지를 읽고 결론서 초안을 만들기 위해서입니다.</li>
            <li className="pub-text"><b>받을 메일 주소</b> — 초안이 준비됐다는 안내를 보내기 위해서입니다.</li>
            <li className="pub-text"><b>숫자 3개와 고른 답</b>(선택해서 내실 때) — 한 달 방문·가입·유료 손님 수와 질문 3개의 답으로 완성본을 다시 계산하기 위해서입니다.</li>
            <li className="pub-text"><b>열람 기록</b> — 초안을 몇 번 열었는지, 어디까지 읽었는지(%)입니다. 안내와 서비스 개선에만 씁니다.</li>
            <li className="pub-text"><b>접속 주소(IP)</b> — 원문은 저장하지 않고, 하루 신청 횟수를 제한하려고 되돌릴 수 없는 값으로 바꿔 저장합니다.</li>
            <li className="pub-text"><b>수신 거부</b> — 거부하신 메일 주소와 고르신 이유(선택)입니다.</li>
          </ul>
          <p className="pub-caption">이 밖의 정보(이름·전화번호·결제 정보 등)는 무료 초안 단계에서 받지 않습니다.</p>
        </S>
        <S t="2. 얼마나 보관하나요">
          <p className="pub-text">신청일로부터 1년 보관한 뒤 지웁니다. 그 전에 지워 달라고 요청하시면 지체 없이(늦어도 10일 안에) 지웁니다. 수신 거부 주소는 거부 상태를 지키기 위해 계속 보관하며, 이 목록에서도 빼 달라고 하시면 뺍니다.</p>
        </S>
        <S t="3. 다른 곳에 넘기나요">
          <p className="pub-text">제3자에게 제공하지 않습니다. 메일 주소를 광고나 다른 목적에 쓰지 않습니다.</p>
        </S>
        <S t="4. 맡기는 곳과 해외 이전">
          <ul>
            <li className="pub-text"><b>Anthropic(미국)</b> — 초안과 완성본의 글을 쓰는 AI 서비스입니다. 공개된 페이지의 내용과, 입력하신 숫자·고른 답이 전달됩니다. <b>메일 주소는 전달하지 않습니다.</b></li>
            <li className="pub-text"><b>Supabase</b> — 데이터베이스(저장), <b>Vercel</b> — 화면 운영. 서버가 해외에 있을 수 있습니다.</li>
          </ul>
        </S>
        <S t="5. 내 정보를 보거나 지우려면">
          <p className="pub-text">받으신 메일에 답장으로 요청하시면 열람·정정·삭제·처리 정지를 도와 드립니다. 메일을 더 받고 싶지 않으시면 <a href="/unsubscribe">수신 거부</a>에서 바로 하실 수 있습니다. 초안 주소는 받으신 분만 아는 주소이고 검색에 나오지 않습니다.</p>
        </S>
        <S t="6. 어떻게 지키나요">
          <p className="pub-text">초안 주소는 추측할 수 없는 긴 값으로 만들고, 다른 사람의 결과를 볼 수 없게 막았습니다. 저장된 정보는 운영자만 볼 수 있고, 외부에서 직접 읽을 수 없게 잠가 두었습니다. 로그인하지 않는 화면에는 광고·추적용 쿠키를 쓰지 않습니다.</p>
        </S>
        <S t="7. 문의">
          <p className="pub-text">솔루션아카이브 운영자에게 받으신 메일 답장으로 문의해 주세요. 개인정보 관련 요청은 위 방법으로 접수합니다.</p>
        </S>
        <Panel><div className="pub-actions"><PubButtonLink href="/" variant="primary" size="lg">첫 화면으로</PubButtonLink></div></Panel>
      </div>
    </PubShell>
  )
}
