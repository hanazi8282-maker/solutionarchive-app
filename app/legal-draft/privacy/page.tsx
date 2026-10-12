import { DraftShell, draftMetadata } from '../DraftShell'

export const metadata = { ...draftMetadata, title: '개인정보 처리방침 (초안)' }

export default function Page() {
  return (
    <DraftShell title="개인정보 처리방침 (초안)">
      <h2>1. 수집 항목</h2>
      <p className="pub-text">로그인 사용자: 결론서 질의에 입력한 아이디어 원문, 계정 이메일 주소, 입력 시각, 기록 구분(조회·검증 요청과 결과). 로그인하지 않은 방문자: 아이디어 원문과 입력 시각만 저장하며, 이메일·IP 주소·쿠키·브라우저 정보·유입 경로는 이 기록에 저장하지 않는다.</p>
      <p className="pub-text">로그인 사용자가 자가진단 폼을 제출하면 구조화 입력 4칸, AI가 만든 확인 질문, 질문별 답변 원문(질문당 500자 이내), 점수와 인용 문장도 저장한다.</p>
      <p className="pub-text">아이디어는 주소(URL)의 일부로 전달되므로 호스팅 사업자의 접속 기록에 남을 수 있다.</p>
      <h2>2. 수집 방법</h2>
      <p className="pub-text">결론서 화면에서 질의가 처리될 때 서버가 자동으로 기록한다. 폭주 방지를 위해 짧은 시간에 요청이 몰리면 일부 기록을 남기지 않을 수 있다.</p>
      <h2>3. 이용 목적</h2>
      <p className="pub-text">어떤 주제가 많이 조사되는지 통계로 분석해 서비스를 개선한다. 같은 입력으로 7일 안에 다시 요청하면 이전 결과를 보여준다.</p>
      <h2>4. 보관 기간과 삭제 요청</h2>
      <p className="pub-text">[결정 필요: 보관 기간] 현재 초안은 영구 보관이다. 삭제 요청은 접수 후 영업일 14일 이내에 처리한다. 로그인하지 않고 입력한 기록은 입력자를 구별할 수 없어 찾지 못할 수 있다. [연락처 확정 필요]</p>
      <h2>5. 제3자 제공</h2>
      <p className="pub-text">제3자에게 제공하지 않는다.</p>
      <h2>6. 처리 위탁</h2>
      <p className="pub-text">AI 처리(Anthropic): 로그인 사용자의 앵글 검증·자가진단 실행 때만 입력 원문이 전송된다. 로그인하지 않은 방문자의 무료 매칭은 AI에 보내지 않는다. [결정 필요: 사용 계정의 모델 개선(학습) 설정 확인 후 문구 확정]</p>
      <p className="pub-text">데이터베이스(Supabase)와 서버(Vercel)에서 처리된다. [결정 필요: 수탁 고지 여부]</p>
      <h2>7. 열람 범위</h2>
      <p className="pub-text">자가진단 기록은 본인 계정만 조회할 수 있다.</p>
    </DraftShell>
  )
}
