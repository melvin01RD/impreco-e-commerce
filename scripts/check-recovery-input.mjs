// Input simulation ONLY: no environment, database, auth API or real user.
import { createInteractiveInput } from "./lib/hidden-input.mjs";

let terminal;
try {
  terminal = createInteractiveInput();
  console.log("Input simulation only. Use invented text; do not enter a real password.");
  const answer = await terminal.ask("Type SIMULAR to continue: ", { hidden: false, ignoreEmpty: true });
  if (answer !== "SIMULAR") throw new Error();
  const first = await terminal.ask("Invented test text (hidden): ");
  const second = await terminal.ask("Repeat invented test text (hidden): ");
  console.log(first === second && first.length > 0 ? "Simulation passed. No changes made." : "Simulation did not match. No changes made.");
} catch {
  console.error("Simulation cancelled or input unavailable. No changes made.");
  process.exitCode = 1;
} finally {
  terminal?.close();
}
