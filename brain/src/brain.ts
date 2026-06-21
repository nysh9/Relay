import Anthropic from '@anthropic-ai/sdk';
import { Triage } from './types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runBrain(
  transcript: string,
  existing: Partial<Triage>,
  language: string = 'Hindi'
): Promise<Triage> {
  const systemPrompt = `You are the triage brain for RELAY, a disaster-relief intake system in Houston, TX.

Your job: read a ${language} transcript from a caller in crisis and return a structured JSON triage object in English.

RULES — follow these exactly:
1. Return ONLY valid JSON. No prose, no markdown, no code blocks. Just the raw JSON object.
2. Never invent a location, resource, or capability that the caller did not mention.
3. Never decide the resource match — that is the routing engine's job.
4. Set escalate to "911" ONLY if the situation involves active medical emergency, fire, or violence — not mass-care needs like water, shelter, or food.
5. Set escalate to "human" ONLY if the caller is incoherent, inaudible, or the situation remains dangerously ambiguous after all fields are filled. Missing fields alone do NOT trigger escalate — that is handled by nextQuestion.
6. For all normal mass-care situations (water, shelter, food, medical supplies), set escalate to "none".
7. If critical fields are missing (location, people, needs), set the most important missing one as nextQuestion in plain English, and set readyToRoute to false.
8. When readyToRoute is true, always set nextQuestion to null.
9. Only set readyToRoute to true when you have: location, number of people, and at least one need.

REQUIRED OUTPUT SHAPE:
{
  "summary": "brief English summary of the situation",
  "transcriptEnglish": "exact English translation of what the caller said (not a summary — a translation)",
  "people": <number or null>,
  "injuries": "<description or null>",
  "location": { "text": "<what caller said>" } or null,
  "needs": ["water", "shelter", "medical", ...],
  "priority": "P1" or "P2" or "P3",
  "missingFields": ["location", "people", ...],
  "nextQuestion": "<question to ask caller in English, or null>",
  "readyToRoute": <true or false>,
  "escalate": "none" or "human" or "911"
}

PRIORITY GUIDE:
- P1: life-threatening (no water, medical emergency, elderly/infant in danger)
- P2: urgent but stable (stranded, no food, needs shelter soon)
- P3: non-urgent (seeking information, minor needs)`;

const userMessage = `Here is what we already know about this caller:
${JSON.stringify(existing, null, 2)}

New transcript (${language}):
"${transcript}"

Return the updated triage JSON now.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;

  let parsed: Triage;
  try {
    parsed = JSON.parse(raw) as Triage;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw}`);
  }

  // Deterministic override — never trust the LLM to null this out.
  // If we're ready to route, there's no question to ask.
  if (parsed.readyToRoute) {
    parsed.nextQuestion = null;
  }
  return parsed;
}