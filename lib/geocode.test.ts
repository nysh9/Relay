import "dotenv/config";
import { geocodeLocation } from "./geocode";

async function main() {
  console.log("\n── Test 1: a real Houston landmark ──");
  console.log(await geocodeLocation("Buffalo Bayou Park"));

  console.log("\n── Test 2: a street intersection ──");
  console.log(await geocodeLocation("Main Street and Elgin"));

  console.log("\n── Test 3: gibberish → should fall back to city center ──");
  console.log(await geocodeLocation("asdfghjkl nowhere"));
}

main();