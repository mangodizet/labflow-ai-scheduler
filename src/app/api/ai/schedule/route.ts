import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

type GeneratedStep = {
  name: string;
  dayOffset: number;
  durationMinutes: number;
  category: "Hands-on" | "Incubation" | "Assay";
  protocol: string;
};

type GeneratedTemplate = {
  name: string;
  summary: string;
  suggestedStartDate: string | null;
  steps: GeneratedStep[];
};

const systemPrompt = `You are a biological experiment scheduling assistant. When a researcher describes an experiment in natural language (English or Korean), generate a detailed, realistic protocol schedule.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "name": "Experiment name (concise, specific)",
  "summary": "One sentence describing the experiment",
  "suggestedStartDate": "YYYY-MM-DD or null",
  "steps": [
    {
      "name": "Step name",
      "dayOffset": 0,
      "durationMinutes": 60,
      "category": "Hands-on",
      "protocol": "Brief protocol note"
    }
  ]
}

Rules:
- dayOffset: days from start (0 = day 1). Incubation/wait steps start on the day waiting begins.
- durationMinutes: actual hands-on time only (not wait duration). Incubation steps use 10-15 min for note-taking.
- category: "Hands-on" for active lab work, "Incubation" for incubation/resting/wait periods, "Assay" for measurements and imaging.
- Include realistic biological steps based on standard lab protocols.
- If the user mentions a date or relative time ("next Monday", "다음주 월요일", "tomorrow"), parse it relative to todayDate and set suggestedStartDate.
- If no date is mentioned, set suggestedStartDate to null.
- Keep step names concise (2-5 words). Protocol notes should be brief references.
- For THP-1 differentiation: typically PMA treatment → 24h incubation → wash+rest 48h → cytokine treatment → 72h incubation → downstream assay.
- For cell culture: include seeding, media changes at appropriate intervals, passage when needed.
- Generate 5-15 steps covering the full workflow.
- Steps should be ordered by dayOffset (ascending).`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const todayDate = typeof body?.todayDate === "string" ? body.todayDate : new Date().toISOString().split("T")[0];

  if (!prompt) {
    return NextResponse.json(
      { error: "실험 계획을 입력해주세요." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Today's date: ${todayDate}\n\nResearcher's request: ${prompt}`,
      },
    ],
  });

  const rawContent = message.content[0];

  if (rawContent.type !== "text") {
    return NextResponse.json(
      { error: "AI 응답 형식 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  let parsed: GeneratedTemplate;

  try {
    const jsonText = rawContent.text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json(
      { error: "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요." },
      { status: 500 },
    );
  }

  if (!parsed.name || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    return NextResponse.json(
      { error: "유효한 실험 일정을 생성할 수 없습니다. 더 구체적으로 입력해주세요." },
      { status: 400 },
    );
  }

  const validCategories = new Set(["Hands-on", "Incubation", "Assay"]);
  const cleanedSteps: GeneratedStep[] = parsed.steps
    .filter((s) => s.name && typeof s.dayOffset === "number")
    .map((s) => ({
      name: String(s.name).slice(0, 80),
      dayOffset: Math.max(0, Math.floor(s.dayOffset)),
      durationMinutes: Math.min(480, Math.max(10, Math.floor(s.durationMinutes ?? 60))),
      category: validCategories.has(s.category) ? s.category : "Hands-on",
      protocol: String(s.protocol ?? "").slice(0, 200),
    }));

  if (cleanedSteps.length === 0) {
    return NextResponse.json(
      { error: "유효한 실험 스텝을 생성할 수 없습니다." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    name: String(parsed.name).slice(0, 100),
    summary: String(parsed.summary ?? "").slice(0, 300),
    suggestedStartDate: typeof parsed.suggestedStartDate === "string" ? parsed.suggestedStartDate : null,
    steps: cleanedSteps,
  });
}
