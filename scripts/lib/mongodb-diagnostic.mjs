// Only fixed labels and allowlisted codes leave this module. Never return driver
// messages, stack traces, hostnames, or arbitrary error properties.
export function diagnoseMongoError(error) {
  const nodes = [];
  const seen = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    nodes.push(value);
    visit(value.cause);
    visit(value.reason);
    visit(value.error);
    if (value.servers instanceof Map) for (const server of value.servers.values()) visit(server);
    if (Array.isArray(value.errors)) for (const child of value.errors) visit(child);
  }
  visit(error);
  const has = (predicate) => nodes.some(predicate);
  const matches = (pattern) => has((node) => pattern.test(typeof node.message === "string" ? node.message : ""));
  const dns = ["ENOTFOUND", "EAI_AGAIN", "ESERVFAIL", "ENODATA", "EREFUSED", "ETIMEOUT"];
  const network = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"];
  const tls = ["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"];
  const codes = [...new Set(nodes.map((node) => node.code).filter((code) =>
    [13, 18, 8000, ...dns, ...network, ...tls].includes(code)))];
  let category = "indeterminado";
  let action = "No se pudo aislar la causa; revise la conectividad con Atlas.";
  if (has((n) => n.code === 18) || matches(/bad auth|authentication failed|unable to authenticate/i)) {
    category = "autenticación";
    action = "Atlas rechazó la autenticación. Revise usuario de base de datos, contraseña, codificación URI y authSource; no es un error de permisos de lectura.";
  } else if (has((n) => n.code === 13)) {
    category = "permisos de lectura";
    action = "Revise el permiso de lectura sobre storify_catalina_dev.settings.";
  } else if (has((n) => tls.includes(n.code)) || matches(/TLS|SSL|certificate/i)) {
    category = "TLS";
    action = "Revise certificados, reloj y proxy TLS; no desactive la validación TLS.";
  } else if (has((n) => dns.includes(n.code) || /^(querySrv|queryTxt|getaddrinfo)$/.test(n.syscall || ""))) {
    category = "DNS/SRV";
    action = "Revise la resolución DNS SRV/TXT y el resolvedor local.";
  } else if (has((n) => network.includes(n.code))) {
    category = "red";
    action = "Revise firewall, ruta de red y acceso IP de Atlas; este error no confirma un bloqueo de Atlas.";
  } else if (has((n) => n.name === "MongoParseError")) {
    category = "formato de URI";
    action = "Revise el formato de MONGODB_URI.";
  } else if (has((n) => n.name === "MongoServerSelectionError")) {
    category = "selección de servidor";
    action = "Sin causa concluyente: revise red, TLS, disponibilidad y acceso IP de Atlas.";
  }
  return `${category}${codes.length ? ` (códigos: ${codes.join(", ")})` : ""}. ${action}`;
}
