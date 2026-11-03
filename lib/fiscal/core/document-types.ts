import { FiscalError } from "./fiscal-errors";

export const DOCUMENT_TYPES = ["E31", "E32", "E33", "E34", "E41", "E43", "E45"] as const;
export type FiscalDocumentType = (typeof DOCUMENT_TYPES)[number];
export const SOURCE_KINDS = ["order", "purchase", "expense", "adjustment"] as const;
export type FiscalSourceKind = (typeof SOURCE_KINDS)[number];

export const DOCUMENT_CATALOG: Readonly<Record<FiscalDocumentType, {
  readonly name: string;
  readonly source: FiscalSourceKind;
  readonly originalRequired: boolean;
}>> = Object.freeze({
  E31: Object.freeze({ name: "Factura de Crédito Fiscal Electrónica", source: "order", originalRequired: false }),
  E32: Object.freeze({ name: "Factura de Consumo Electrónica", source: "order", originalRequired: false }),
  E33: Object.freeze({ name: "Nota de Débito Electrónica", source: "adjustment", originalRequired: true }),
  E34: Object.freeze({ name: "Nota de Crédito Electrónica", source: "adjustment", originalRequired: true }),
  E41: Object.freeze({ name: "Comprobante Electrónico de Compras", source: "purchase", originalRequired: false }),
  E43: Object.freeze({ name: "Comprobante Electrónico de Gastos Menores", source: "expense", originalRequired: false }),
  E45: Object.freeze({ name: "Comprobante Electrónico Gubernamental", source: "order", originalRequired: false }),
});

export function parseDocumentType(value: unknown): FiscalDocumentType {
  if (typeof value !== "string" || !DOCUMENT_TYPES.includes(value as FiscalDocumentType)) {
    throw new FiscalError("UNSUPPORTED_TYPE");
  }
  return value as FiscalDocumentType;
}

export function assertDocumentOrigin(type: FiscalDocumentType, source: FiscalSourceKind, originalId?: string) {
  const definition = DOCUMENT_CATALOG[parseDocumentType(type)];
  if (definition.source !== source || definition.originalRequired !== Boolean(originalId)) {
    throw new FiscalError("INVALID_ORIGIN");
  }
}

/** Deliberately a code gate. A database flag alone cannot certify an implementation. */
export function assertIssuanceImplemented(type: FiscalDocumentType): never {
  parseDocumentType(type);
  throw new FiscalError("ISSUANCE_BLOCKED");
}
