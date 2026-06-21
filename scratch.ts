import { geocodeLocation } from "./geocode";
import { findMatch } from "./matchmaker";
import resources from "../data/resources.json";
import type { Resource } from "../types";

async function main() {
  const loc = await geocodeLocation("near the convention center");
  const dispatch = findMatch(["water", "shelter"], loc, resources as Resource[]);
  console.log(dispatch);
}

main();