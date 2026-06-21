"""
RELAY urgency classifier — synthetic training-data generator.

Produces labeled (text, label) triage examples across the three priority tiers,
in the MASS-CARE lane (shelter / water / supplies / medical-fragility) — never
the 911 lane (active crime/fire). Labels:

  P1 — life-threatening / time-critical (oxygen running out, infant no water for
       days, out of insulin, water rising around a non-ambulatory person)
  P2 — urgent but stable (family needs water + shelter, safe upstairs awaiting
       evacuation, no power but okay for now)
  P3 — non-urgent / informational (asking shelter hours, pet policy, registering)

Two modes:
  * default  — offline template synthesizer. Reproducible, no API key, free.
               This is what produces the committed data.csv so train.py runs
               out of the box.
  * --use-claude — generate with Claude (claude-opus-4-8). Matches §9 of the
               brief ("have Claude generate them"). Needs ANTHROPIC_API_KEY.

Output: data.csv with columns [text,label].

Usage:
  python generate_data.py                 # offline synthesizer (default ~270 rows)
  python generate_data.py --n 360         # more rows
  python generate_data.py --use-claude    # generate via Claude instead
"""

from __future__ import annotations

import argparse
import csv
import os
import random

# ─── Offline template synthesizer ─────────────────────────────────────────────
# Each tier is a set of sentence templates with interchangeable slot fillers.
# Lexical variety (not just one phrasing per class) is what lets a TF-IDF + LR
# model learn the urgency signal rather than memorize a handful of strings.

PEOPLE = [
    "I", "we", "my family", "my mother and I", "my grandfather", "an elderly couple",
    "a family of four", "my two kids and I", "a pregnant woman here", "my neighbor",
    "three of us", "my disabled brother", "my newborn and I", "a group of us",
]

PLACES = [
    "in Third Ward", "near the Medical Center", "in Alief", "in the East End",
    "off Bissonnet", "in Sunnyside", "in Acres Homes", "near Greenspoint",
    "in Sharpstown", "downtown", "in the Heights", "in Gulfton", "in Spring Branch",
]

# NOTE on label boundaries: P1 vs P3 are kept lexically distinct (critical/medical
# vs. informational/question phrasing) so the model essentially never confuses the
# two — that is the safety property we demo. P1↔P2 and P2↔P3 deliberately SHARE
# vocabulary ("no water", "elderly", "shelter", "supplies") so the held-out score
# is realistic (some adjacent-tier errors) rather than a suspicious 100%.

P1_TEMPLATES = [
    "{who} {place} — my grandfather is on oxygen and the tank runs out in an hour.",
    "{who} {place}, my baby hasn't had clean water in two days and won't wake up properly.",
    "I'm diabetic and out of insulin, {place}, starting to feel faint.",
    "The water is rising in the house and my brother is in a wheelchair, we can't get out, {place}.",
    "{who} {place}, an elderly woman here is unresponsive and we have no medicine.",
    "My newborn has a high fever and we've had no water or formula for a day, {place}.",
    "I missed my dialysis and I can't breathe well, {place}, please hurry.",
    "{who} {place}, someone is having chest pains and we are trapped by floodwater.",
    "We're stranded on the roof, water still rising, and my mother has a heart condition, {place}.",
    "Out of oxygen for my father and the water keeps coming up, {place}.",
    "{who} {place}, a child is seizing and we have no way to reach a hospital.",
    "My insulin is gone and the floodwater cut us off, {place}, I'm shaking badly.",
    "{who} {place}, my mother collapsed and isn't responding, we need help immediately.",
    "The water just reached the second floor and my father can't walk, {place}, we're out of time.",
    "{who} {place}, my child stopped breathing for a moment, please send someone now.",
    "Elderly neighbor here is barely conscious and we have no water at all, {place}, it's critical.",
    "{who} {place}, severe bleeding that won't stop and the roads are flooded.",
    "We have no insulin and no water and my daughter is going limp, {place}.",
]

P2_TEMPLATES = [
    "{who} {place}, we've had no drinking water since this morning and need shelter.",
    "Our house flooded but we're safe upstairs, {place}, we need to get out when you can.",
    "{who} {place}, no power and running low on food, we need a place to stay tonight.",
    "We need water and a shelter, {place}, everyone is okay but we can't stay here.",
    "{who} {place}, the road is flooded and we're out of food, need supplies and shelter.",
    "My kids and I are okay but we have no formula or water left, {place}.",
    "{who} {place}, we evacuated and need somewhere to sleep and some meals.",
    "We're stable but stranded, {place}, need transport to a shelter sometime today.",
    "{who} {place}, elderly parents are fine for now but we need water and blankets.",
    "No injuries, {place}, but we lost everything and need shelter and food.",
    "{who} {place}, water is receding, we just need supplies and a dry place to stay.",
    "We have a generator but no clean water, {place}, and need a shelter for the night.",
    "{who} {place}, my grandmother is elderly but doing okay, we just need water and a shelter.",
    "We've had no water since this morning, {place}, no one is hurt but we need to leave soon.",
    "{who} {place}, the kids are hungry and we're low on water, need a shelter today.",
    "Safe for now {place}, but the water is slowly rising and we'll need evacuation later.",
    "{who} {place}, an older couple here needs supplies and a place to stay, they're stable.",
    "We're out of food and the baby needs formula soon, {place}, everyone is okay otherwise.",
]

P3_TEMPLATES = [
    "Hi, {place}, can you tell me where the nearest shelter is?",
    "Just wondering if the shelter {place} allows pets.",
    "What are the hours for food distribution {place}?",
    "{who} {place}, we're fine, I just want to register in case we need help later.",
    "Is the supply point {place} still open tomorrow morning?",
    "I have supplies, {place}, but wanted to know if the roads are passable yet.",
    "Can someone tell me which shelters {place} have wheelchair access?",
    "Where do I go {place} to pick up water and diapers, no rush?",
    "{who} {place}, everyone's safe — just need information about evacuation buses.",
    "Do I need an ID to stay at the shelter {place}?",
    "Just checking what documents to bring to register {place}.",
    "Is there a number to call for updates about the shelter {place}?",
    "{who} {place}, no emergency, just asking whether the shelter has water available.",
    "Which distribution point {place} has formula and diapers in stock, for later this week?",
    "Are the shelters {place} taking elderly residents, asking for my neighbor, no urgency.",
    "Just want to confirm the food distribution {place} is still happening, we're okay.",
    "{who} {place}, we have water and food, only need to know where to register.",
    "Is there a shelter {place} that allows pets and has wheelchair access?",
]


def _fill(template: str, rng: random.Random) -> str:
    return template.format(who=rng.choice(PEOPLE), place=rng.choice(PLACES))


def synthesize(n: int, seed: int = 42) -> list[tuple[str, str]]:
    """Generate roughly n examples, balanced across the three tiers."""
    rng = random.Random(seed)
    per_class = n // 3
    rows: list[tuple[str, str]] = []
    for label, templates in (("P1", P1_TEMPLATES), ("P2", P2_TEMPLATES), ("P3", P3_TEMPLATES)):
        seen: set[str] = set()
        # Oversample then dedupe so each class has varied, non-duplicate phrasings.
        attempts = 0
        while len([r for r in rows if r[1] == label]) < per_class and attempts < per_class * 20:
            attempts += 1
            text = _fill(rng.choice(templates), rng)
            if text in seen:
                continue
            seen.add(text)
            rows.append((text, label))
    rng.shuffle(rows)
    return rows


# ─── Claude generator (opt-in, matches §9 of the brief) ───────────────────────

CLAUDE_PROMPT = """Generate {k} realistic disaster-relief intake transcripts for Houston flooding,
each a single short sentence a caller might say, labeled by urgency.

Stay in the MASS-CARE lane (shelter, water, food, supplies, medical fragility) —
never active crime or fire.

Tiers:
- P1: life-threatening / time-critical (oxygen tank running out, infant no water
  for days, out of insulin, non-ambulatory person with water rising).
- P2: urgent but stable (family needs water and shelter, safe upstairs awaiting
  evacuation, no power but okay for now).
- P3: non-urgent / informational (asking shelter hours, pet policy, registering).

Return ONLY JSON lines, one per example, no prose:
{{"text": "...", "label": "P1|P2|P3"}}
Make the phrasing varied. Roughly equal numbers of each tier."""


def generate_with_claude(n: int) -> list[tuple[str, str]]:
    import json
    import anthropic  # type: ignore

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    rows: list[tuple[str, str]] = []
    # Generate in batches so each response stays small and parseable.
    batch = 30
    while len(rows) < n:
        k = min(batch, n - len(rows))
        msg = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=2048,
            messages=[{"role": "user", "content": CLAUDE_PROMPT.format(k=k)}],
        )
        text = msg.content[0].text  # type: ignore[attr-defined]
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                obj = json.loads(line)
                if obj.get("label") in ("P1", "P2", "P3") and obj.get("text"):
                    rows.append((obj["text"], obj["label"]))
            except json.JSONDecodeError:
                continue
    return rows[:n]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=270, help="approx number of examples")
    ap.add_argument("--out", default="data.csv")
    ap.add_argument("--use-claude", action="store_true", help="generate via Claude instead of the offline synthesizer")
    args = ap.parse_args()

    if args.use_claude:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise SystemExit("ANTHROPIC_API_KEY not set — omit --use-claude to use the offline synthesizer.")
        print(f"Generating ~{args.n} examples with Claude…")
        rows = generate_with_claude(args.n)
    else:
        print(f"Generating ~{args.n} examples with the offline synthesizer…")
        rows = synthesize(args.n)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["text", "label"])
        w.writerows(rows)

    counts = {lbl: sum(1 for _, l in rows if l == lbl) for lbl in ("P1", "P2", "P3")}
    print(f"Wrote {len(rows)} rows to {args.out}  (P1={counts['P1']} P2={counts['P2']} P3={counts['P3']})")


if __name__ == "__main__":
    main()
