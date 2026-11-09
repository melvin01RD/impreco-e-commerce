# QA — IMP-FE-015 Facturador Gratuito

## DEV ?nico e aislamiento l?gico (IMP-INFRA-016)

Todas las pruebas usan la configuraci?n DEV de `.env`, la base existente
`storify_catalina_dev` y la aplicaci?n en `http://localhost:3000`.
No hay bases temporales, MongoDB adicional, `.env.qa` ni simulador S3 requerido.
Las reglas fiscales y sus aserciones de integridad no cambian.

- `pnpm test:fiscal`: unitarias sin conexi?n a servicios.
- `pnpm test:fiscal:integration`: modelos con colecciones prefijadas por UUID
  en DEV. Transacciones, unicidad y rollback reales; limpieza solo de esas
  colecciones. Nunca se elimina la base ni se consultan modelos comerciales reales.
- `pnpm test:e2e`: tres comprobaciones de acceso/sesi?n sin fixtures.
- `pnpm test:e2e:fiscal`: los nueve casos completos contra DEV, con cuentas,
  pedidos y referencias sint?ticos distintos para cada ejecuci?n. Conserva PDF,
  permisos, CSRF, evidencia, inmutabilidad, idempotencia, duplicados y concurrencia.
- `pnpm test:report`: reporte HTML. La suite fiscal desactiva trazas para no
  guardar URLs firmadas de almacenamiento ni datos ajenos del DEV compartido.

Los E2E fiscales requieren DEV instalado, ?ndices ?nicos fiscales y bucket
privado existente y separado. El setup falla antes de sembrar si falta algo;
no instala, crea buckets ni modifica settings. Use Chrome instalado con
`$env:PLAYWRIGHT_CHANNEL='chrome'` o el Chromium que ya tenga Playwright.
Reinicie el servidor despu?s de editar `.env`. El login usa cuentas aleatorias
sembradas en DEV, nunca contrase?as administrativas reales.

La limpieza valida manifiesto, IDs, marcador de ejecuci?n, emisor sint?tico y
propietario del expediente antes de borrar sus datos. Tambi?n compara el pedido
sint?tico completo con su hash inicial para detectar escrituras comerciales.
No borra contadores compartidos de rate limit: expiran por la pol?tica existente.
No se emite, numera ni consulta un comprobante real de DGII.

Si se interrumpe el proceso, conserve `.fiscal-test-runs/` (ignorado por Git).
Para una integraci?n, use `node scripts/cleanup-fiscal-integration.mjs <run-id>`:
solo acepta las colecciones prefijadas del manifiesto de esa ejecuci?n.
Para E2E, seleccione el ID exacto del manifiesto y ejecute:

```powershell
$env:FISCAL_E2E_RUN_ID = 'ID_HEXADECIMAL_DE_32_CARACTERES_DEL_MANIFIESTO'
node --import ./scripts/lib/load-dev-env.mjs --require ./scripts/lib/finance-cli.cjs --import tsx scripts/fiscal-dev-fixtures.ts cleanup
```

No elimine manualmente colecciones compartidas ni use un borrado global. Si una
carga fue confirmada por almacenamiento pero no qued? registrada como evidencia,
puede requerir revisi?n del prefijo del expediente sint?tico; no se borran objetos
sin procedencia verificable. Cierre cualquier sesi?n de prueba abierta.

## Comandos sin pnpm en PATH

```powershell
node scripts/check-mongodb.mjs
node scripts/test-fiscal.mjs
node scripts/test-fiscal.mjs --integration
node node_modules/@playwright/test/cli.js test
node node_modules/@playwright/test/cli.js test --config playwright.fiscal.config.ts
node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@playwright/test/cli.js show-report
```

El antiguo `scripts/fiscal-qa-server.mjs` es un alias de compatibilidad para
`scripts/fiscal-dev-server.mjs`; ya no levanta servicios ni siembra datos.
Su c?digo local anterior se conserv? en un respaldo ignorado en
`.fiscal-test-runs/IMP-INFRA-016-original-fiscal-qa-server.mjs.bak`.

## Cobertura
- Pruebas originales de tipos/orígenes, estados de transmisión legacy, cálculo exacto, descuentos, snapshots, PDF comercial y bloqueo de emisión.
- Contrato manual: montos, moneda, descuento/envío, fechas, tipos, E33, evidencia, estado oficial independiente y reconciliación.
- MongoDB: preparaciones concurrentes idempotentes, snapshots inmutables, reservas únicas, UUID repetido/conflictivo, evidencia de otro expediente, versiones simultáneas, discrepancia de montos, captura/corrección/revisión, E31 y E33 válidos, rollback ante fallo de auditoría y pedido completo sin cambios.
- API: anónimo/cliente/admin, Origin, cuerpo estricto, MIME/firma/tamaño, evidencia ajena, duplicados, carreras, descarga privada y replay.
- Navegador: cargar pedido, clasificar, preparar, adjuntar evidencia, registrar e-CF, comprobar pendiente pese a ACEPTADO, revisar manualmente, conciliar y marcar corrección.
- Regresión de dos descargas de PDF comercial sin producir factura fiscal.

## Resultados hist?ricos de IMP-FE-015 (antes de IMP-INFRA-016)
Resultados consolidados en el [reporte de entrega](IMP-FE-015-delivery.md). Unitarias 26/26, integraciones 2/2, Playwright 9/9, TypeScript y ESLint completos aprobados. Build aislado webpack aprobado con salida 0 y 296 páginas generadas; avisos de qz-tray/lna y caché next-intl detallados en el reporte. No se ejecutó el build predeterminado Turbopack. TypeScript volvió a pasar después del build con tsconfig restaurado.

Línea base antes de editar: 19/19 unitarias aprobadas. Durante implementación: 26/26 unitarias y 2 integraciones aprobadas; se amplió la integración para E31/E33/rollback. Un caso de prueba inicialmente usaba un número de longitud válida como ejemplo inválido; se corrigió el fixture, sin relajar el esquema.

Incidencias intermedias Playwright: fallo de título por codificación al escribir un archivo, Chromium no instalado, selectores de select y tiempo insuficiente en primera navegación al detalle. Se corrigieron título/selectores y se comprobó explícitamente el POST antes de esperar la carga del detalle (hasta 30 segundos por compilación inicial). Se utilizó Chrome instalado. La ejecución simultánea de chequeos grandes provocó un timeout API; se repitió sin esa carga. Una caché de Next interrumpida produjo un error transitorio de runtime webpack; se eliminó únicamente el directorio generado y se repitió con caché limpia: 9/9 aprobadas en 2,8 minutos. Queda un warning de dependencias dinámicas de caché de next-intl, sin fallo de prueba. Windows requirió permiso fuera del sandbox para cerrar el árbol del servidor temporal; no se conectó Atlas.

## Revisión operativa posterior (no realizada)
1. Revisar cambios e índices nuevos. No hacer push/merge automático.
2. Operador autorizado revisa los índices necesarios en DEV y las ACL del bucket privado. No ejecutar cambios sobre datos reales como parte del diagnóstico. No requiere una base QA separada.
3. Responsable fiscal revisa clasificación, moneda/identidad de pedidos y selección del emisor, especialmente en ventas multivendedor.
4. Con un comprobante oficial real ya emitido en DGII, comprobar transcripción/evidencia/revisión. Nunca usar datos de pruebas como números oficiales.
5. Verificar política de retención, backups y acceso por rol. Los archivos no pasan por antivirus y el origen no se autentica criptográficamente.
6. No declarar integración ni emisión DGII completada: este es un flujo manual, sin comunicación con DGII.
