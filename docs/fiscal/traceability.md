# Trazabilidad y alcance real

Ningún tipo está habilitado para emisión real. “Preparación” es un borrador interno Sandbox, no un comprobante aceptado. Las pruebas de reglas parciales no prueban cumplimiento íntegro de DGII.

| Ticket | Requisito / fuente | Código | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| IMP-FE-001 | Catálogo de siete tipos solicitado; catálogo DGII | `core/document-types.ts` | `document-types.test.ts` | Completo: registro, origen, bloqueo |
| IMP-FE-002 | Independencia fiscal, instantánea, índices y auditoría | `models/fiscal-*`, `core/snapshot.ts` | `persistence.test.ts`, `mongo.integration.test.ts` | Completo para persistencia de preparación; índices QA pendientes |
| IMP-FE-003 | Importes exactos y conciliación | `core/tax-calculator.ts` | `tax-calculator.test.ts` | Parcial: falta clasificación/retenciones/mapeo tributario aprobado |
| IMP-FE-004 | Contrato Medasoft | `providers/medasoft/*` | `medasoft.test.ts` | Parcial: login/perfil y respuestas mock; emisión/consulta bloqueadas |
| IMP-FE-005 | Atomicidad, idempotencia, estados desconocidos | `services/issuance.ts`, `fiscal-audit.ts`, `core/state-machine.ts` | Integración replica set, `state-machine.test.ts` | Parcial: sin worker emisor ni recuperación automática de leases |
| IMP-FE-006 | E31 explícito / E32 consumidor, campos 38–40 formato DGII | `core/document-resolver.ts`, `fiscal-validator.ts` | `sales-selection.test.ts`, `state-machine.test.ts` | Parcial: dominio; UI checkout/persistencia en pedido pendiente |
| IMP-FE-007 | Emisión E31/E32 | Puerta `assertIssuanceImplemented` | Rechazo comprobado antes de envío | Bloqueado: contrato, numeración, emisor y clasificaciones |
| IMP-FE-008 | Separar PDF comercial y documento autorizado; historial | `lib/orders/order-invoice.ts`, `invoice-pdf.tsx`, `/admin/fiscal`, rutas GET fiscales | `commercial-pdf.test.ts`, Playwright `access.spec.ts` | Parcial: consulta/historial/PDF comercial; RI fiscal pendiente |
| IMP-FE-009 | E34 referencia y límite acumulado | `services/issuance.ts` | Dos créditos concurrentes: solo uno cabe en saldo | Parcial: sin emisión, plazos/motivos/ITBIS ni conexión a devolución |
| IMP-FE-010 | E33 referencia inmutable | `services/issuance.ts` | Preparación E33 sobre original aceptado simulado | Parcial: reglas adicionales/emisión pendientes |
| IMP-FE-011 | E41 desde compras | Catálogo, validación de origen y borrador | Origen correcto y emisión bloqueada en integración | Parcial: no existe libro de compras habilitado/mapeo de retenciones |
| IMP-FE-012 | E43 desde gastos aplicables | Catálogo, validación de origen y borrador | Origen correcto y emisión bloqueada en integración | Parcial: elegibilidad y conexión a gastos pendientes |
| IMP-FE-013 | E45 gubernamental autorizado | Catálogo y borrador | Registro y bloqueo de emisión | Parcial: datos institucionales y autorización pendientes |
| IMP-FE-014 | Playwright TS, regresión y preparación QA | Scripts, configuración y `e2e/fiscal` | Ver `qa.md` | Parcial: checks ejecutados; no certificación ni regresión comercial integral |

## Dependencias por completar

1. Contrato versionado Medasoft y fixtures de cada tipo. Confirmar FechaEmision y campos requeridos por tipo contra XSD vigente.
2. Numeración autorizada y propiedad de secuencia, idempotencia ante timeout, consulta inequívoca y respuesta a secuencia consumida.
3. Empresa Sandbox y autorizaciones por tipo. No se entregaron credenciales y no se usaron credenciales reales.
4. Decisión de emisor en ventas multivendedor, tratamiento de anticipos, devoluciones, transporte/cargos, moneda y retenciones.
5. Clasificación tributaria de productos/gastos/compras revisada. No se deduce del impuesto global comercial.
6. Validación de inscripción/estatus RNC; validación estructural de longitud no es validación tributaria.
7. Integración completa en todos los creadores web/móvil/POS/admin y pruebas de checkout invitado, pagos, reembolsos e inventario.
8. Representación impresa, XML y custodia privada; cotejar modelos DGII vigentes, sellos, QR y firma usando evidencia real del proveedor.

## Matriz de pruebas solicitadas

| Grupo | Cubierto | Pendiente |
| --- | --- | --- |
| 1–3: selección/identificación | Resolución explícita, estructura de RNC/razón social, umbral E32, extranjero | Formulario checkout e inscripción RNC |
| 4–5: cálculo/redondeo | Decimal, descuentos, tasas suministradas, inclusión/exención/no facturable | Regla fiscal completa y retenciones |
| 6, 11–13: persistencia/idempotencia/concurrencia/estados | Replica set real aislado, rollback, conflicto, crédito concurrente, transición terminal | Caída de worker/consulta real |
| 7–10: proveedor | Mocks de respuestas, rechazo, timeout, sin reintentos ciegos | Envío simulado completo y contrato Sandbox real |
| 14–17: E33/E34/E41/E43/E45 | Soporte de preparación/orígenes/límite conservador | Emisión legalmente validada |
| 18–19: seguridad | Auth anónima/cliente/admin según QA, server-only, redacción, sin producción | Roles fiscales delegados y revisión operativa |
| 20: regresión | Totales comerciales seleccionados, PDF comercial, acceso a factura existente, compilación | Compra integral, gateways, inventario, devoluciones y móvil |
