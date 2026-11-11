import { checkPasswordPolicy } from "../../lib/auth/password-policy.ts";

export const passwordErrorMessages = Object.freeze({
  PASSWORD_MISMATCH: "PASSWORD_MISMATCH: Password confirmation does not match. No changes made.",
  PASSWORD_POLICY_FAILED: "PASSWORD_POLICY_FAILED: Password does not meet the stated length or complexity requirements. No changes made.",
  PASSWORD_CONTAINS_EMAIL: "PASSWORD_CONTAINS_EMAIL: Password must not contain the account email. No changes made.",
});

/** No environment, database or auth API access. Errors contain fixed codes only. */
export async function readValidatedPassword(terminal, policy, email, setPhase) {
  setPhase("password input (no writes)");
  const password = await terminal.ask("New password: ");
  const confirmation = await terminal.ask("Confirm password: ");
  setPhase("password validation (no writes)");
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  if (checkPasswordPolicy(password, policy)) throw new Error("PASSWORD_POLICY_FAILED");
  if (password.toLowerCase().includes(email.toLowerCase())) throw new Error("PASSWORD_CONTAINS_EMAIL");
  return password;
}
