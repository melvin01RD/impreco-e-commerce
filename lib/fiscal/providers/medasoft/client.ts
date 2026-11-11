import "server-only";
import { FiscalError } from "../../core/fiscal-errors";
import type { FiscalProvider, ProviderResult } from "../fiscal-provider.interface";
import { companyResponseSchema, loginResponseSchema } from "./schemas";
import { medasoftNetworkEnabled } from "../mode";

type SandboxConfig = { apiKey: string; apiSecret: string; issuerTaxId: string; timeoutMs: number };

/** Only documented login/profile calls. Sending and querying documents remain blocked. */
export class MedasoftSandboxProvider implements FiscalProvider {
  constructor(private readonly config: SandboxConfig, private readonly http: typeof fetch = fetch) {
    if (!config.apiKey || !config.apiSecret || !/^(\d{9}|\d{11})$/.test(config.issuerTaxId) ||
        !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 30000) {
      throw new FiscalError("PROVIDER_UNVERIFIED");
    }
  }

  private async request(path: "/login" | "/company/me", init: RequestInit) {
    if (!medasoftNetworkEnabled()) throw new FiscalError("PROVIDER_UNVERIFIED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.http(`https://medasoftfe.com${path}`, {
        ...init, signal: controller.signal, redirect: "error", cache: "no-store",
      });
      if (!response.ok) throw new FiscalError("PROVIDER_UNVERIFIED");
      // Bound response size even without Content-Length; no body or tokens in logs.
      const reader = response.body?.getReader();
      if (!reader) throw new FiscalError("PROVIDER_UNVERIFIED");
      let size = 0, body = "";
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 65536) { await reader.cancel(); throw new FiscalError("PROVIDER_UNVERIFIED"); }
          body += decoder.decode(chunk.value, { stream: true });
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(body + decoder.decode()) as unknown;
    } catch { throw new FiscalError("PROVIDER_UNVERIFIED"); }
    finally { clearTimeout(timer); }
  }

  async verifySandbox() {
    const login = loginResponseSchema.safeParse(await this.request("/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: this.config.apiKey, apiSecret: this.config.apiSecret }),
    }));
    if (!login.success) throw new FiscalError("PROVIDER_UNVERIFIED");
    const company = companyResponseSchema.safeParse(await this.request("/company/me", {
      method: "GET", headers: { Authorization: `Bearer ${login.data.token}` },
    }));
    if (!company.success || !company.data.isActive || company.data.dgiiServer !== "testecf" ||
        company.data.registryNumber !== this.config.issuerTaxId) throw new FiscalError("PROVIDER_UNVERIFIED");
    return { environment: "sandbox" as const, issuerTaxId: company.data.registryNumber };
  }

  async issue(): Promise<ProviderResult> { throw new FiscalError("PROVIDER_UNVERIFIED"); }
  async reconcile(): Promise<ProviderResult> { throw new FiscalError("PROVIDER_UNVERIFIED"); }
}

export function medasoftSandboxFromEnvironment() {
  return new MedasoftSandboxProvider({
    apiKey: process.env.MEDASOFT_SANDBOX_API_KEY || "",
    apiSecret: process.env.MEDASOFT_SANDBOX_API_SECRET || "",
    issuerTaxId: process.env.MEDASOFT_SANDBOX_ISSUER_RNC || "", timeoutMs: 10000,
  });
}
