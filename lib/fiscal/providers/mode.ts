/** Credentials alone never enable network. No automatic issuer exists for the free invoicer. */
export function medasoftNetworkEnabled() {
  return process.env.FISCAL_PROVIDER_MODE === "medasoft-sandbox" && process.env.FISCAL_MEDASOFT_NETWORK === "true";
}
