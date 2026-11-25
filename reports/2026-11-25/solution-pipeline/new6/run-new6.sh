#!/bin/bash
# 2-5d 처음 보는 6곳: 주소만 주고 원장 자동 생성 → 카드까지(2-2 명령).
cd /c/Users/DCU/Desktop/Cowork/sa-v71ee-pr
O=reports/2026-11-25/solution-pipeline/new6
run(){ node --env-file=.env.local scripts/solution-pipeline.mjs --company "$2" --out $O/$1 --a-used 4 >> $O/run.out 2>&1; }
run taxeasy "https://taxeasy.co.kr/,https://play.google.com/store/apps/details?id=kr.co.taxeasy.app&hl=ko"
run chalkaksiru "https://apps.apple.com/kr/app/id6769615882"
run autoke "https://autoke.ai/ko"
run creazy "https://creazy.app/ko"
run pagemaker "https://pagemaker.ai.kr/"
run metaflyer "https://www.metaflyer.io/"
