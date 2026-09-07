# LabFlow AI Scheduler 프로젝트 컨텍스트

## 프로젝트 개요
- **목적:** 생물 실험 스케줄링 웹앱
- **경로:** `E:\AI\dev\labflow-ai-scheduler`
- **기술 스택:** Next.js, Supabase, Google Calendar API, Claude AI API
- **배포:** Vercel (main 브랜치 자동 배포)

## 핵심 기능
- 자연어 입력으로 생물 실험 일정 자동 생성 (Claude API)
- Google Calendar 연동으로 실험 일정 관리
- 월간 캘린더 그리드 + 날짜 클릭 모달
- 실험 단계 카테고리: Hands-on / Incubation / Assay

## 검증 (코드 수정 후 반드시 실행)
```
verify.cmd   # tsc 타입 체크 + Vitest + ESLint
```
개별 실행:
```
npx tsc --noEmit
npm test
npm run lint
```

## 빌드 및 배포
```
npm run build
git push  # Vercel 자동 배포
```

## 주의사항
- Supabase service role key, Google API 키, Claude API 키는 절대 코드에 직접 쓰지 않는다
- Vercel Hobby 무료 플랜 유지
- Google Calendar API 무료 한도 주의
- Claude API 사용량 비용 발생 가능 — 호출 최소화

## UI 구현 안전 규칙

- 디자인을 수정할 때는 예쁜 효과보다 먼저 잘리지 않는 레이아웃을 우선한다.
- UI 작업은 실제 화면에서 잘림, 겹침, 튀어나옴이 없는 상태까지 확인해야 완료로 본다.
- 컨트롤, 버튼, 카드, 패널은 부모 영역 밖으로 나가면 안 된다.
- 긴 텍스트는 줄바꿈, 말줄임, 스크롤 중 하나로 처리한다.
- 디자인 변경 후 반드시 브라우저에서 실제 화면을 확인한다.

## Web UI 구현 주의사항

- 모바일, 태블릿, 데스크톱에서 레이아웃이 깨지지 않도록 반응형 기준을 먼저 잡는다.
- 고정 width보다 `max-width`, `minmax`, `fr`, `%`, `clamp` 등 반응형 단위를 우선한다.
- 버튼, 카드, 테이블, 모달은 작은 화면에서 잘리거나 화면 밖으로 나가면 안 된다.
- 긴 텍스트는 `overflow-wrap`, `word-break`, `text-overflow`, 줄바꿈 중 하나로 처리한다.
- 가로 스크롤이 필요한 테이블은 의도적으로 scroll wrapper를 둔다.
- absolute/fixed 요소는 부모 기준과 z-index를 명확히 관리한다.
- 변경 후 브라우저에서 실제 화면을 확인하고, 모바일 폭에서도 겹침/잘림이 없는지 본다.

## 참고
- 공통 작업 프로필: `C:\Users\User\CLAUDE.md`
