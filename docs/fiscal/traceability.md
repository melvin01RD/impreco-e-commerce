# Trazabilidad IMP-FE-015
| Criterio | Implementación | Verificación |
| --- | --- | --- |
| Sin emisión/red Medasoft por defecto | providers/mode.ts, medasoft/client.ts, services/fiscal-audit.ts; code gate de emisión conservado | medasoft.test.ts, pruebas anteriores |
| Snapshot desde pedido, sin e-NCF | manual/snapshot.ts, manual/service.ts | manual.test.ts, manual.integration.test.ts |
| Registro E31/E32/E33 aplicable | manual/contracts.ts y servicio; E33 requiere pedido de ajuste y original | schemas + integración |
| Estados internos independientes | WORK_STATES, DGII_STATES, reconciledState | tests y API/UI |
| Revisión manual con evidencia | executeCaseCommand verify; actor, hora, fuente y coincidencias | integración y Playwright |
| Duplicados y carreras | FiscalOfficialClaim único emisor/e-NCF, expectedVersion, eventos UUID/hash | integración y API concurrente |
| RBAC/CSRF | withApi admin, requireAdminPageAccess, Origin | Playwright anónimo/cliente/admin |
| Interfaz pendientes/detalle/conciliación | manual-workbench.tsx, manual-case-detail.tsx | flujo navegador Playwright |
| Evidencia privada | StorageService, prefijo privado, MIME/firma/límite, descarga protegida | API y UI con S3 simulado |
| Pedidos/inventario preservados | solo lecturas de Order; ninguna escritura comercial | integración compara documento completo |
| Cálculos conservados | tax-calculator, fiscal-validator; extracción compartida party.ts | pruebas anteriores + nuevas |
| Documentos no oficiales | aviso de datos comerciales, PDF anterior intacto | regresión PDF/API |
| Sin base real/configuración/push | harness efímero, entorno hijo permitido explícitamente | revisión de diff y comandos |

## Aceptación operativa
- Preparar nunca crea e-NCF ni escribe pago/entrega/inventario.
- Capturar siempre deja PENDIENTE_VERIFICACION, aunque el estado transcrito sea ACEPTADO.
- Solo verificación manual explícita con evidencia del expediente y datos coincidentes puede conciliar; EN_PROCESO/RECHAZADO no concilian.
- Dos administradores con la misma versión no pueden sobrescribirse. Repetir la misma solicitud no duplica eventos.
- Un e-NCF pertenece a un emisor y un expediente; las capturas anteriores quedan auditadas y su reserva no se libera.
- Anónimos/clientes/staff sin rol admin no acceden a operaciones o descargas.
- Prueba real de emisión/validación DGII: **no realizada ni declarada**. El software no incorpora integración directa al Facturador Gratuito.

## Pendientes y límites
Validación operativa de Catalina con su responsable fiscal, revisión de clasificaciones y régimen/identificación; política de retención/backups/ACL privadas; revisión antivirus según política de la organización; clasificación multivendedor (el administrador elige el emisor y no se infiere de la tienda). El constructor requiere datos comerciales compatibles; no modifica pedidos para hacerlos coincidir.

No se implementa corrección destructiva de snapshots, emisión de ajustes ni rectificación ante DGII. Correcciones del registro interno no rectifican el comprobante oficial. Cambiar emisor/valores del expediente original exige un procedimiento de revisión de datos separado. Eventos/evidencias antiguos permanecen en MongoDB; el detalle muestra los últimos 200 de cada colección.

No se integran estas modificaciones a develop/qa/main ni se hace push. El alcance manual es independiente de la automatización MongoDB QA de otra rama.
