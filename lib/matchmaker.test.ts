import { findMatch } from "./matchmaker";
import resources from "../data/resources.json";
import type { Resource, CallerLocation } from "../types";

const data = resources as Resource[];
const caller: CallerLocation = {
  text: "downtown near the convention center",
  lat: 29.7525,
  lng: -95.3570,
};

console.log("\n── Test 1: water + shelter ──");
console.log(findMatch(["water", "shelter"], caller, data));

console.log("\n── Test 2: medical ──");
console.log(findMatch(["medical"], caller, data));

console.log("\n── Test 3: GUARDRAIL — impossible need → matched:null ──");
console.log(findMatch(["helicopter"], caller, data));