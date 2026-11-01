import type { FiscalSnapshot } from "../core/snapshot";

export type ProviderResult = {
  encf: string;
  providerId: string;
  status: "pending" | "accepted" | "conditionally_accepted" | "rejected";
};

/** Internal port. No assumption about HTTP endpoints or idempotency headers. */
export interface FiscalProvider {
  issue(snapshot: FiscalSnapshot): Promise<ProviderResult>;
  reconcile(reference: { encf?: string; providerId?: string }): Promise<ProviderResult>;
}
