# Propuesta de PR — no creado

Base: `qa`. Head: `DGII-electronic-invoicing`.

Título: `IMP-FE: base fiscal auditable y consulta administrativa con emisión bloqueada`

Los pedidos solo contaban con documentos comerciales identificados por número de pedido. Esta entrega añade un dominio fiscal independiente: siete tipos registrados, instantáneas inmutables, eventos, outbox bloqueado, cálculo decimal, preparación transaccional e idempotente y reserva acumulada de crédito. La consulta `/admin/fiscal` está restringida a administradores y el PDF de pedido ahora declara expresamente su naturaleza comercial.

**Alcance parcial:** ningún e-CF puede emitirse. El adaptador Medasoft verifica login/perfil Sandbox según guías públicas, pero envío, numeración y reconciliación real requieren contrato y fixtures verificados. Checkout, pagos e inventario mantienen sus flujos existentes. No está implementada la selección visible de E31/E32 ni la integración comercial completa de ajustes/compras/gastos/gobierno. Revisar la matriz de tickets antes de aprobar esta base para QA; no aprobarla como módulo fiscal terminado.

Validación: 19 unitarias, integración con replica set temporal y seis pruebas Playwright HTTP aprobadas. TypeScript y lint completos aprobados; build webpack aislado y chequeo de chunks aprobados. PDFs comerciales descargados dos veces sin crear documentos fiscales. Sin certificación Sandbox, prueba visual ni regresión integral de compra/pago/inventario.

Operación: crear índices en BD QA con `scripts/prepare-fiscal-indexes.ts` tras revisar su salida sin `--apply`. Mantener emisión deshabilitada. Sin migraciones destructivas, llamadas fiscales reales, PR abierto, merge o despliegue productivo. Ver `qa.md` y `medasoft.md` para requisitos y limitaciones.
