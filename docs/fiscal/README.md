# Facturación electrónica IMPRECO

Esta entrega implementa una base fiscal independiente y una consulta administrativa. **No es un módulo de emisión completo ni certificado. Todos los tipos siguen deshabilitados.**

- [Auditoría previa y plan](00-audit.md)
- [Arquitectura, modelos, endpoints, estados y errores](architecture.md)
- [Fuentes consultadas](references.md)
- [Contrato Medasoft, variables y bloqueos](medasoft.md)
- [Evidencia por ticket](tickets.md)
- [Matriz de trazabilidad y pendientes](traceability.md)
- [QA, pruebas y preparación de despliegue](qa.md)
- [Propuesta de PR hacia QA, sin abrir](pr-to-qa.md)

## Inventario de cambios

| Área | Archivos |
| --- | --- |
| Dominio fiscal nuevo | `lib/fiscal/core/{document-types,document-resolver,fiscal-errors,fiscal-validator,snapshot,state-machine,tax-calculator}.ts` |
| Proveedor nuevo | `lib/fiscal/providers/fiscal-provider.interface.ts`, `medasoft/{client,mapper,schemas}.ts` |
| Servicios nuevos | `lib/fiscal/services/{issuance,fiscal-audit,queries}.ts` |
| Modelos nuevos | `models/fiscal-{invoice,event,outbox,settings}.model.ts` |
| Rutas nuevas | `app/api/admin/fiscal/{route.ts,capabilities/route.ts,[id]/route.ts}` |
| Páginas nuevas | `app/[locale]/admin/fiscal/{page.tsx,[id]/page.tsx}` |
| Extensiones | `components/layout/dashboard-sidebar.tsx`, `lib/orders/{order-invoice.ts,invoice-pdf.tsx}` |
| Unitarias/integración | `tests/fiscal/*` |
| Playwright | `e2e/fiscal/access.spec.ts`, `playwright.fiscal.config.ts` |
| Herramientas | `scripts/{test-fiscal.mjs,fiscal-qa-server.mjs,prepare-fiscal-indexes.ts}` |
| Configuración de desarrollo | `package.json`, `pnpm-lock.yaml`, `.gitignore` |

No se modificaron creadores de pedidos, pagos, inventario, autenticación ni cálculo comercial del checkout. El cambio de PDF afecta su rotulación comercial y carga del renderer, no importes. Esto reduce superficie de regresión, pero no sustituye una compra integral en QA.

Preparación de revisión: comparar `54d6c1d` con HEAD en `DGII-electronic-invoicing`. Los commits se identifican por ticket. No abrir/mergear PR ni desplegar producción sin autorización. La revisión propuesta es hacia `qa` y debe explicitar los tickets parciales y la ausencia de emisión.
