# Evidencia por ticket

## IMP-FE-001

- Archivos: `core/document-types.ts`, `core/fiscal-errors.ts`, prueba `document-types.test.ts`.
- Siete tipos registrados; E44/E46/E47 rechazados; origen y referencia de ajustes verificados. Emisión bloqueada por código.
- `corepack pnpm exec tsx --test tests/fiscal/document-types.test.ts`: 3/3 aprobadas.
- El ejecutable `pnpm` no está en PATH; se utiliza Corepack con la versión declarada en package.json.
- Auditoría previa: `00-audit.md`. La habilitación de tipos queda fuera de este ticket.
