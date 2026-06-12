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

## 참고
- 공통 작업 프로필: `C:\Users\User\CLAUDE.md`
