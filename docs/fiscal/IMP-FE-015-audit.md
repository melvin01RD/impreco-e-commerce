# IMP-FE-015 — auditoría previa y alcance
Fecha: 2026-11-08. Rama confirmada: `feat/IMP-FE-015-dgii-free`, árbol limpio al comenzar. Sin modificación de .env, .env.qa, Atlas, secretos, develop, qa o main; sin push.

| Área inspeccionada | Comportamiento comprobado antes del cambio |
| --- | --- |
| lib/fiscal/core/document-types.ts | Siete tipos catalogados; assertIssuanceImplemented bloquea todos, incluyendo E31/E32. |
| services/issuance.ts | Aceptaba un snapshot interno, no construía desde Order; solo sandbox. Transacción de invoice/event/outbox bloqueado. No caller de checkout. |
| services/fiscal-audit.ts | Impedía queue/send pero permitía registrar resultado/verifiedAt a callers internos. Ahora también requiere modo legado explícito. |
| providers/medasoft/client.ts | Login y company/me podían salir a red con credenciales; issue/reconcile bloqueados. Se añadió doble configuración opt-in antes de cualquier fetch. |
| core/tax-calculator.ts | BigInt, half-up por línea, descuentos por mayor resto; validador recalcula todo. Conservado. |
| core/snapshot.ts | Esquema estricto, JSON canónico, SHA-256. Separación de party.ts solo para compartir validaciones sin crypto en navegador. |
| FiscalInvoice/Event/Outbox/Settings | Estados de transmisión/resultado del prototipo proveedor. No reinterpretados como estados oficiales del flujo manual. Persistencia anterior preservada. |
| API y páginas fiscales | GET administrativos con trazas parciales, sin operaciones de emisión ni preparación desde pedido. Consulta anterior preservada en /admin/fiscal/legacy y /admin/fiscal/:id. |
| Order, checkout, pedidos/PDF | Importes Number y moneda del pedido; no clasificación tributaria suficiente por línea. No llamadas a prepareFiscalDraft/Medasoft. PDF rotulado comercial, no e-CF. |
| almacenamiento | uploadPrivateFile S3 compatible disponible; local rechaza nuevas cargas. getPrivateDownload podía buscar archivos legacy en bucket público: nuevo flujo fija el bucket privado también como bucket de lectura, evitando ese fallback. |
| autenticación/auditoría | withApi exige admin y sesión Better Auth; página usa requireAdminPageAccess. runTransaction exige replica set, trata reintentos y commit desconocido. |

La suite existente pasó 19/19 antes de editar. No se tomó como prueba el nombre de un archivo ni la documentación antigua; se inspeccionaron los cuerpos de los servicios y sus referencias.

## Decisiones
- IMPRECO es sistema comercial; el operador emite en el Facturador Gratuito. No se automatiza el portal ni se reciben credenciales/certificados DGII.
- Nuevas colecciones manuales separadas de los prototipos de transmisión; no se sobrescriben estados históricos.
- Clasificación explícita por línea y conciliación exacta; no inferir tasa de nombre/precio ni usar settings actuales como evidencia histórica.
- Catálogo manual E31/E32; E33 solo cuando otro pedido comercial representa el ajuste y existe original E31/E32 conciliado del mismo emisor/receptor. No crear una nota de débito reutilizando el total del pedido original.
- No se asegura validez oficial ni se validan RNC activos automáticamente. El operador aporta datos y evidencia; la revisión queda atribuida y fechada.

Los estados reportados del instructivo oficial incluyen Aceptado, Aceptado Condicional, En proceso y Rechazado. Se conservan separados del trabajo interno. [Instructivo DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Facturador%20Gratuito/Instructivo-Facturador-Gratuito-de-FE.pdf)
