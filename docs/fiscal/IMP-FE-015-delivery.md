# Entrega IMP-FE-015

Rama: `feat/IMP-FE-015-dgii-free`. Implementación local para revisión; sin commit, push, merge ni despliegue. IMPRECO prepara y concilia datos comerciales; el operador emite exclusivamente en el Facturador Gratuito oficial.

## Decisiones y comportamiento

- El adaptador Medasoft se conserva. Credenciales presentes no habilitan red: requiere dos opciones explícitas de sandbox. Emisión automática y transmisión continúan bloqueadas.
- El servidor lee Order y construye un snapshot inmutable con hash. La clasificación tributaria debe ser explícita y los importes deben coincidir exactamente; no se generan e-NCF ni escrituras comerciales.
- Capturar un e-CF oficial siempre deja PENDIENTE_VERIFICACION. El estado DGII transcrito se mantiene separado. Solo una revisión humana explícita y respaldada por evidencia puede conciliar datos coincidentes.
- Las transacciones incluyen reserva única, actualización por versión y evento auditable. Reintentos con la misma clave/payload son idempotentes; conflictos devuelven 409.
- Better Auth exige administrador en API, páginas y descarga. Las mutaciones validan Origin y cuerpos estrictos. Evidencia PDF/PNG/JPEG hasta 4 MiB, con firma de tipo, hash y claves generadas por servidor en bucket privado separado.
- Checkout, pagos, entrega, inventario y PDF comercial no fueron modificados.

## Archivos

| Grupo | Archivos nuevos o modificados |
| --- | --- |
| Núcleo manual | `lib/fiscal/manual/contracts.ts`, `snapshot.ts`, `service.ts`, `http.ts` |
| Validación compartida | `lib/fiscal/core/party.ts`, `lib/fiscal/core/snapshot.ts` |
| Persistencia | `models/fiscal-case.model.ts`, `scripts/prepare-fiscal-indexes.ts` |
| Aislamiento legado | `lib/fiscal/providers/mode.ts`, `providers/medasoft/client.ts`, `services/fiscal-audit.ts`, `services/queries.ts` |
| API | `app/api/admin/fiscal/cases/route.ts`, `source/route.ts`, `[id]/route.ts`, `[id]/evidence/route.ts`, `[id]/evidence/[evidenceId]/route.ts` |
| Interfaz | `app/[locale]/admin/fiscal/page.tsx`, `cases/[id]/page.tsx`, `legacy/page.tsx`; `components/admin/fiscal/manual-workbench.tsx`, `manual-case-detail.tsx` |
| Almacenamiento | `lib/storage/private-prefixes.ts` |
| Pruebas | `tests/fiscal/manual-fixtures.ts`, `manual.test.ts`, `manual.integration.test.ts`, `medasoft.test.ts`, `mongo.integration.test.ts`; `e2e/fiscal/manual.spec.ts` |
| Entorno de pruebas | `playwright.fiscal.config.ts`, `scripts/fiscal-qa-server.mjs`, `scripts/lib/fiscal-test-storage.mjs` |
| Documentación | `README.md`, `docs/fiscal/README.md`, `architecture.md`, `qa.md`, `traceability.md`, `IMP-FE-015-audit.md`, este reporte |

## Índices y migración

Colecciones nuevas: FiscalCase, FiscalCaseEvent, FiscalOfficialClaim y FiscalEvidence. Índices únicos: emisor+pedido, emisor+e-NCF, expediente+versión y expediente+requestId. Se reservan permanentemente los números de capturas anteriores. El servicio también rechaza números presentes en FiscalInvoice production.

No se migran ni sobrescriben documentos anteriores. El plan de índices se ejecutó sin `--apply`, sin conexión. Antes de habilitar las rutas en un entorno real, un operador autorizado debe revisar duplicados, crear los índices y comprobar replica set/ACL del almacenamiento. No se aplicaron índices en Atlas.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Línea base unitaria antes de editar | 19/19 aprobadas |
| Unitarias finales | 26/26 aprobadas |
| Integraciones MongoDB temporal | 2/2 aprobadas; incluyen concurrencia, rollback, E31/E33 y Order intacto |
| TypeScript completo | Aprobado también después del build y de restaurar tsconfig, sin emitir archivos |
| ESLint completo (`--quiet`) | Aprobado |
| Plan de índices offline | Aprobado, sin `--apply` |
| Playwright API/navegador | 9/9 aprobadas con Chrome instalado, caché limpia y servicios locales temporales |
| Build aislado | Aprobado con webpack, salida 0 y 296 páginas generadas; avisos de dependencias descritos abajo |
| Comprobador de chunks | Salida 0; encontró 0 referencias precargadas aplicables en webpack, no acredita el build Turbopack |

No se detectó un fallo unitario previo: la línea base pasó. Los fallos intermedios de codificación, selectores, caché y tiempos del entorno de pruebas se documentan en [QA](qa.md), sin atribuirlos al código previo. Las pruebas utilizan datos sintéticos y no acreditan funcionamiento con DGII real.

Avisos de compilación fuera del módulo fiscal: `qz-tray` no resuelve `lna` en la ruta de impresión existente; webpack advierte sobre el import dinámico de `next-intl` y falla al guardar parte de su caché. No se modificaron esas dependencias ni el flujo de impresión. No se ejecutó un build de línea base para afirmar que estos avisos ya se reproducían antes. Next conserva `ignoreBuildErrors: true`; por eso se ejecutó TypeScript completo de forma independiente.

Se comprobó el build aislado `next build --webpack`, no el comando predeterminado Turbopack de `pnpm build`. Se restauraron únicamente los cambios automáticos de Next en `tsconfig.json`; no queda modificación de ese archivo.

## Riesgos y aceptación pendiente

1. Revisión operativa del responsable fiscal de Catalina: clasificación, emisor y receptor, especialmente en pedidos multivendedor. El sistema no valida RNC activos ni certifica datos.
2. El constructor admite pedidos DOP con precios sin impuesto incluido y montos conciliables. Rechaza moneda ausente, aduanas cobradas y datos incompatibles. E33 exige otro pedido comercial de ajuste y un original conciliado; no crea ajustes ni implementa E34.
3. Un snapshot mal preparado exige revisión de datos separada; no hay reemplazo destructivo. Las correcciones de capturas conservan historial y no rectifican ante DGII.
4. Verificar ACL, retención y backups del proveedor real. La evidencia no tiene antivirus ni autenticación criptográfica de procedencia. Puede quedar un objeto huérfano si se pierde la confirmación de metadatos; no se elimina automáticamente.
5. Un administrador puede capturar y revisar: no se exige separación entre dos personas. La interfaz muestra los últimos 200 eventos/evidencias; los anteriores se conservan.
6. Un eventual escritor legado deberá compartir las reservas globales antes de habilitarse; actualmente no hay emisión automática activa.

Los criterios funcionales y su cobertura están en [trazabilidad](traceability.md). La aceptación operativa con un documento oficial real sigue pendiente. **No se declara integración API, emisión ni validación automatizada DGII.**
