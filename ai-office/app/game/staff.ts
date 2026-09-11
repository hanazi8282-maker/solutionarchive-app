// 인사기록부 — 직원 + 대표 1명
// 실제 내용은 프로젝트 루트의 company.config.ts 에서 가져옵니다.
// 이 파일은 고칠 필요 없어요. 이름·성격·색을 바꾸려면 company.config.ts 를 여세요.

import { CEO_PROFILE, DEPARTMENTS, PENDING_INTEGRATIONS, STAFF_LIST } from "../../company.config";

export type StaffSeed = {
  id: string;
  name: string;
  callsign?: string;
  role: string;
  deptId: string;
  rank: "lead" | "member" | "ceo";
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
  /** 자리를 비웠을 때 혼잣말하는 생각 */
  thoughts: string[];
};

const SKIN = ["#ffdcc4", "#f7cdae", "#ffe3cf", "#eec39f"];

function skin(i: number) {
  return SKIN[i % SKIN.length];
}

let seq = 0;
function make(
  dept: string,
  rank: StaffSeed["rank"],
  name: string,
  role: string,
  colors: [string, string, string],
  thoughts: string[],
  callsign?: string,
): StaffSeed {
  const i = seq++;
  return {
    id: `${dept}-${rank === "lead" ? "lead" : `m${i}`}`,
    name,
    callsign,
    role,
    deptId: dept,
    rank,
    hair: colors[0],
    shirt: colors[1],
    accent: colors[2],
    skin: skin(i),
    thoughts,
  };
}

export const CEO: StaffSeed = {
  id: "ceo",
  name: CEO_PROFILE.name,
  callsign: CEO_PROFILE.callsign,
  role: CEO_PROFILE.role,
  deptId: "ceo",
  rank: "ceo",
  hair: CEO_PROFILE.hair,
  shirt: CEO_PROFILE.shirt,
  accent: CEO_PROFILE.accent,
  skin: CEO_PROFILE.skin,
  thoughts: [...CEO_PROFILE.thoughts],
};

export const STAFF: StaffSeed[] = STAFF_LIST.map((s) =>
  make(s.dept, s.rank, s.name, s.role, s.colors, s.thoughts, s.callsign),
);

// 리드가 0명이면 엔진이 그 팀을 부를 때 터지고, 2명이면 한 명이 조용히 덮어써진다.
// 둘 다 config 오타에서 나오므로 여기서 바로 잡는다.
for (const dept of DEPARTMENTS) {
  const leads = STAFF.filter((s) => s.deptId === dept.id && s.rank === "lead").length;
  if (leads !== 1) {
    throw new Error(
      `${dept.name}(${dept.id}) 의 rank:"lead" 가 ${leads}명입니다 — 팀마다 정확히 1명이어야 해요. ` +
        "company.config.ts 의 STAFF_LIST 를 확인하세요.",
    );
  }
}

export const DEPT_LEAD: Record<string, StaffSeed> = Object.fromEntries(
  STAFF.filter((s) => s.rank === "lead").map((s) => [s.deptId, s]),
);

/** 부서별 오늘 업무 · 한줄보고 */
export const DEPT_BRIEF: Record<string, { task: string; report: string }> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, { task: d.task, report: d.report }]),
);

/** 아직 외부 연동이 안 붙은 부서 → 화면에 "연동 대기"로 표시 */
export const BLOCK_NEED: Record<string, string> = PENDING_INTEGRATIONS;
