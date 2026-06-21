import { triageToDispatch } from "./pipeline";
import type { Triage } from "../brain/src/types";

async function main() {
  const fakeTriage: Triage = {
    summary: "Family of four near the convention center, no water, needs shelter.",
    transcriptEnglish: "We are four people near the convention center with no water.",
    people: 4,
    injuries: null,
    location: { text: "near the convention center downtown Houston" },
    needs: ["water", "shelter"],
    priority: "P2",
    missingFields: [],
    nextQuestion: null,
    readyToRoute: true,
    escalate: "none",
  };

  console.log("\n── readyToRoute → should return a match ──");
  console.log(await triageToDispatch(fakeTriage));

  console.log("\n── escalate:911 → should return null ──");
  console.log(await triageToDispatch({ ...fakeTriage, escalate: "911" }));

  console.log("\n── not ready → should return null ──");
  console.log(await triageToDispatch({ ...fakeTriage, readyToRoute: false }));
}

main();