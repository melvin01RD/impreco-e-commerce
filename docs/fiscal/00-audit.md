# Auditoría previa — IMPRECO FE

Fecha: 2026-11-01. Base: `54d6c1d`, rama `DGII-electronic-invoicing`.
Árbol limpio antes de cambios. El repositorio está en `Storify-main-app-v3.0`.
No se modifica `main`, no se abre PR ni se despliega.

## Reutilización y extensiones

| Área inspeccionada | Hallazgo / decisión |
| --- | --- |
| `models/order.model.ts` | Importes comerciales numéricos, descuentos por línea/cupón, subpedidos, reservas e historial. No convertir el pedido en comprobante fiscal. |
| `models/customer-profile.model.ts` | Direcciones y preferencias editables. El receptor fiscal requiere instantánea independiente. |
| `models/settings.model.ts` | Tasa comercial configurable. No demuestra clasificación ITBIS de cada producto ni autorización de un emisor. |
| `lib/catalog/discounts.ts` | `calculateCheckoutTotals` redondea por moneda, descuenta mercancía/transporte por separado y aplica tasa al subtotal descontado. Usa Number. Mantener comportamiento; el cálculo fiscal separado debe rechazar diferencias. |
| `lib/checkout/prepare-checkout.ts` | Preparación compartida por web/móvil, invitados, crédito de tienda, anticipos, reservas, redirecciones y varios gateways. Un cambio debe propagarse a todos los creadores de pedidos. |
| `app/api/orders/route.ts` | Creación directa restringida a COD; utiliza totales comerciales. |
| `app/api/payments/checkout/route.ts`, Stripe/PayPal/webhooks | Pago y creación no son una sola operación síncrona. No emitir desde un retorno de navegador ni asumir que un anticipo equivale a pago completo. |
| `app/api/pos/orders/route.ts`, `lib/orders/create-admin-order.ts` | Creadores adicionales; POS tiene comprador anónimo y descuentos propios. |
| `lib/orders/order-payment-status.ts` | Pago por subpedido, anticipos, saldos y reembolsos. Los estados fiscales deben ser independientes. |
| `lib/orders/order-invoice.ts`, `invoice-pdf.tsx` | PDF comercial reusable; `invoiceNumber = order.orderNumber`. No equivale a e-NCF. |
| Rutas `app/api/{admin/,}orders/[id]/invoice` | GET de PDF; autenticación, propietario/alcance de personal. No introducir emisión como efecto de lectura. |
| `models/expense.model.ts`, `app/api/admin/finance/expenses` | Gastos reales y liquidación contable. No todo gasto es elegible E43. No se identificó un libro de compras de proveedores equivalente para E41. |
| Devoluciones `app/api/admin/returns`, `lib/returns` | Reembolso comercial y movimiento de inventario no son una nota E34. Conservar original y reservar saldo acreditable transaccionalmente. |
| `lib/db-transaction.ts` | Transacciones con detección de replica set y tratamiento de resultado desconocido. Reutilizar; nunca hacer HTTP en callback reintentable. |
| `lib/api-next/idempotency.ts` | Reutiliza solicitud vencida y libera fallos: no es adecuado para reemitir fiscalmente tras timeout. Reutilizar concepto de índice único, no política de reenvío. |
| `models/message-outbox.model.ts` | Cola con leases, reintentos y TTL terminal. Fiscal necesita retención de evidencia y resultado desconocido sin reenvío automático. |
| `lib/api/handler.ts` | Better Auth y autorización reutilizables. Nuevas rutas fiscales inicialmente solo administrador. |

## Riesgos y dependencias

- Impuestos globales no prueban tasas/clasificaciones de artículos, transporte, aduanas o descuentos. La fiscalización requiere clasificación aprobada y conciliación exacta.
- Tienda multivendedor: determinar quién es emisor de cada operación antes de habilitar tipos. No facturar todas las ventas bajo IMPRECO por inferencia.
- Numeración autorizada, credenciales de Sandbox, certificado gestionado por proveedor y autorización DGII no disponibles/verificados en esta auditoría.
- No se encontró suite unit/E2E ni Playwright Test instalado en este checkout. Existen scripts de reportes financieros y preventas; no equivalen a regresión automatizada.
- No consultar ni escribir la base configurada en `.env` durante pruebas. Usar datos sintéticos y MongoDB replica set aislado explícito.
- Documento DGII previamente suministrado no está disponible. Se consultó el formato público enlazado en `references.md`; no se afirma haber leído otro adjunto.

## Plan incremental

1. IMP-FE-001: catálogo cerrado de siete tipos y validación de origen; todos bloqueados para emisión por defecto.
2. IMP-FE-002: instantáneas inmutables, estado separado, eventos, configuración y outbox con índices únicos.
3. IMP-FE-003: cálculo decimal exacto y conciliación, sin cambiar precios del checkout existente.
4. IMP-FE-004: contratos documentados Medasoft y adaptador server-only; bloquear lo no verificado.
5. IMP-FE-005: preparación transaccional, claves de operación, máquina de estados y reconciliación sin reenvío ciego.
6. IMP-FE-006–008: selección/datos de comprador, puente a pedido y consulta administrativa; emisión/PDF autorizados sujetos a validación de contrato y clasificación.
7. IMP-FE-009–013: ajustes con reserva acumulada y orígenes compra/gasto/gobierno. No habilitar fiscalmente sin reglas verificadas.
8. IMP-FE-014: pruebas y matriz honesta de pendientes; preparar revisión a QA sin abrir PR.

Cada ticket tendrá evidencia y commit propio cuando pueda verificarse; la presencia de código de soporte no significa certificación ni ticket funcional terminado.
