# Evidencia por ticket

## IMP-FE-001

- Archivos: `core/document-types.ts`, `core/fiscal-errors.ts`, prueba `document-types.test.ts`.
- Siete tipos registrados; E44/E46/E47 rechazados; origen y referencia de ajustes verificados. Emisión bloqueada por código.
- `corepack pnpm exec tsx --test tests/fiscal/document-types.test.ts`: 3/3 aprobadas.
- El ejecutable `pnpm` no está en PATH; se utiliza Corepack con la versión declarada en package.json.
- Auditoría previa: `00-audit.md`. La habilitación de tipos queda fuera de este ticket.

## IMP-FE-002

- Modelos independientes `FiscalInvoice`, `FiscalEvent`, `FiscalSettings`, `FiscalOutbox`; snapshot JSON canónico con hash SHA-256, importes como strings, campos inmutables, sin secretos ni TTL fiscal.
- 3 pruebas de esquemas y una integración con MongoDB 8.0.17 replica set temporal aprobadas. Se verifican seis inserciones concurrentes, unicidad, rechazo de sustitución del snapshot y rollback de evento/outbox.
- La primera prueba detectó que Mongoose omitía silenciosamente cambios inmutables; se añadió rechazo explícito de actualizaciones y pipelines. Reejecución aprobada.
- TypeScript completo aprobado mediante `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` tras agotamiento de memoria con el límite original.
- Dependencias exclusivamente de desarrollo: Playwright Test y MongoDB Memory Server. No se conectó Atlas. Índices probados en réplica aislada; requieren creación explícita en QA.

## IMP-FE-003

- `core/tax-calculator.ts`: aritmética BigInt decimal, precios/cantidades a cuatro decimales, redondeo half-up a centavos, descuentos proporcionales con resto determinista, impuestos incluidos/excluidos, tasas suministradas, exentos/no facturables y transporte como línea explícita.
- 4 pruebas aprobadas; incluye comparación con `calculateCheckoutTotals` existente para cupón y envío.
- Alcance parcial: primitivas comprobadas; no se habilita una política tributaria ni se cambia el cálculo comercial global. Clasificación de productos, cargos, retenciones y aprobación de redondeo por tipo pendientes. No se infieren tasas.

## IMP-FE-004

- Interfaz fiscal, cliente Sandbox server-only para login/perfil, validadores de respuesta y normalización de estados.
- Tres pruebas mock aprobadas: estados/rechazo, ambiente/emisor, timeout/redacción/sin reintentos. No pruebas de contrato reales.
- Parcial/bloqueado: emisión, numeración y reconciliación requieren resolver lo documentado en `medasoft.md`. Ningún HTTP de emisión implementado.

## IMP-FE-005

- Preparación transaccional de instantánea/evento/outbox bloqueado; clave derivada de operación comercial independiente de HTTP; conflicto si cambia la instantánea.
- Máquina de estados separa transmisión y dictamen; actualización optimista con auditoría atómica. Resultados desconocidos no pueden volver a cola.
- Integración MongoDB aprobada: cuatro preparaciones simultáneas retornan un documento; un evento y una cola; conflicto de contenido; trabajador obsoleto rechazado; dos créditos concurrentes no superan el original.
- Parcial: trabajador emisor, recuperación de leases y consulta real bloqueados por contrato. No hay cron fiscal activo. La máquina interna no afirma conocer todos los estados DGII.

## IMP-FE-006

- Resolución de venta E32 por defecto y E31 solo por solicitud explícita. Validadores estructurales de comprador, umbral E32 y conciliación de instantánea.
- Pruebas de selección y validación aprobadas.
- Pendiente: activar selección en checkout y persistir en todos los creadores web/móvil/POS/admin. Sin tipos habilitados no se ofrece una promesa fiscal al comprador ni se solicitan datos innecesarios.

## IMP-FE-007

- Bloqueado. `requestFiscalIssuance` rechaza emisión para todos los tipos, con evidencia de integración. No se llama al proveedor desde pagos, lectura de pedidos o descarga de PDF.

## IMP-FE-008

- `/admin/fiscal` e historial, tres endpoints GET con autenticación solo administrador, filtros, paginación y búsqueda exacta.
- PDF comercial distingue número de pedido y declara que no es e-CF. El renderer existente se carga al generar el PDF; el constructor de datos puede verificarse sin inicializarlo.
- Unitarias de datos PDF aprobadas; detalles de Playwright en `qa.md`.
- Parcial: no hay descarga RI/XML autorizados ni botones de escritura fiscales. Requieren contrato y validación fiscal.

## IMP-FE-009–013

- Soporte de preparación y pruebas de orígenes/referencia/saldo documentados en `traceability.md`.
- Las primitivas de crédito se incorporaron con IMP-FE-005 porque la reserva debe pertenecer a la misma transacción de preparación; esta dependencia justifica el adelanto de esa parte.
- No se consideran tickets funcionales completos: faltan reglas específicas, integración con operaciones comerciales y emisión.

## IMP-FE-014

- Documentación técnica, fuentes, matriz, procedimientos de QA, suite Playwright Test y datos aislados.
- Preparación de índices sin borrado mediante `scripts/prepare-fiscal-indexes.ts` (no ejecutada sobre QA).
- Pendiente certificación Sandbox y regresión comercial integral. PR no abierto; merge/despliegue no realizados.
