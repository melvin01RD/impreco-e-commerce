# Arquitectura fiscal — IMP-FE-015 Facturador Gratuito

IMPRECO prepara datos comerciales. Catalina utiliza el Facturador Gratuito oficial para emitir; el sistema no tiene integración API con ese facturador ni automatiza el navegador. No genera e-NCF, QR fiscal, firma, XML autorizado ni dictámenes DGII.

## Flujo
1. Administrador carga un pedido por ID, identifica emisor/receptor, elige E31/E32 o E33 aplicable y clasifica cada línea y transporte.
2. El servidor relee Order, exige moneda DOP explícita y concilia subtotal/descuento/impuesto/total. Crea snapshot inmutable, hash y evento en una transacción. Estado PENDIENTE_EMISION; sin e-NCF, outbox ni cambios de pago/inventario.
3. Operador copia los datos y emite fuera de IMPRECO en DGII.
4. Adjunta evidencia oficial privada (PDF/PNG/JPEG, hasta 4 MiB, MIME y firma inicial comprobados). No se acepta URL ni ruta de almacenamiento del cliente.
5. Registra tipo, e-NCF, emisor, receptor, fecha, moneda, importes, estado DGII observado y referencia/evidencia de origen. Siempre queda PENDIENTE_VERIFICACION, incluso si transcribe ACEPTADO.
6. Revisa manualmente la fuente oficial, afirma la revisión, aporta referencia/evidencia y estado observado. Identidad e importes deben coincidir con snapshot para CONCILIADO. EN_PROCESO permanece pendiente; RECHAZADO o diferencias requieren corrección.
7. Corregir una captura o marcar revisión pendiente conserva todos los valores anteriores en eventos. La instantánea original no se edita.

## Estados independientes
Internos: PENDIENTE_EMISION, PENDIENTE_VERIFICACION, CONCILIADO, REQUIERE_CORRECCION.
Oficiales reportados: ACEPTADO, ACEPTADO_CONDICIONAL, EN_PROCESO, RECHAZADO.
CONCILIADO significa revisión humana documentada y comparación con snapshot, no una respuesta automatizada ni certificación de IMPRECO. Un nuevo registro restablece revisión pendiente. El mismo administrador puede capturar y revisar; segregación de dos personas no es requisito implementado.

## Persistencia e índices
- FiscalCase / fiscalcases: pedido, emisor, tipo, snapshotJson/hash/inputHash inmutables, actor, captura actual, estado interno/oficial y versión. único (issuerTaxId, orderId); índice (state, createdAt).
- FiscalCaseEvent / fiscalcaseevents: acción, actor, hora, motivo, datos anteriores/nuevos y evidencia de revisión. únicos (caseId, version) y (caseId, requestId). Sin TTL.
- FiscalOfficialClaim / fiscalofficialclaims: reserva permanente de (issuerTaxId, encf), única sin partición por ambiente. Un número retirado de una captura no queda libre para otra venta.
- FiscalEvidence / fiscalevidences: caseId, clave privada oculta, MIME, tamaño, hash SHA-256, referencia oficial, actor y fecha. índice (caseId, createdAt). Sin TTL.

Se impiden actualización/reemplazo/borrado de eventos/reservas/evidencia a través de modelos y actualización de snapshots. Estas defensas no sustituyen permisos y backups: acceso nativo de un operador MongoDB puede omitir middleware. No hay endpoints de borrado.

Preparación idempotente por emisor+pedido y hash de entrada; un retry no vuelve a capturar un pedido cambiado. Comandos: UUID requestId + payload/actor canónico, expectedVersion y compare-and-swap. Documento, reserva de número y evento comparten runTransaction, sin HTTP en callbacks. Conflictos/versiones desactualizadas devuelven 409; validación 400. Un resultado incierto exige recargar/reintentar con la misma clave, no generar otra operación.

No hay migración de datos anterior. El registro nuevo rechaza un e-NCF que ya figure en FiscalInvoice production. El índice global cubre el flujo manual; antes de habilitar un emisor legado futuro habrá que unificar sus reservas para que ambos escritores compartan la restricción.

## Dinero y límites
Se reutilizan cálculo decimal, validación de receptor y snapshot existentes. Los Number comerciales se convierten a centavos seguros y se rechazan precisiones no representables; no se redondea una diferencia para forzar conciliación. Se reparte el descuento de mercancía, se clasifica el envío y se compara el impuesto/total exacto. No se modifica checkout.

El constructor desde Order soporta precios comerciales sin impuesto incluido. Pedidos sin moneda, cancelados, aduanas cobradas, importes inconsistentes o clasificaciones incompletas fallan de forma explícita. Las primitivas existentes sí conservan sus pruebas de precio con impuesto incluido; no se atribuye al nuevo constructor un mapeo que Order no documenta. Clasificación, RNC y condición de emisor no se certifican automáticamente.

E33 exige un pedido distinto para el ajuste comercial, original E31/E32 conciliado del mismo emisor y receptor, motivo y e-NCF original. No se implementa generación de ajustes comerciales ni E34 en este flujo. Un snapshot mal preparado se marca REQUIERE_CORRECCION y se escala: no hay reemplazo destructivo ni reapertura silenciosa del mismo origen.

## API y autorización
- GET/POST /api/admin/fiscal/cases: lista paginada y preparación.
- GET /api/admin/fiscal/cases/source?orderId=…: datos comerciales necesarios para clasificar.
- GET/POST /api/admin/fiscal/cases/:id: detalle y register/verify/correction.
- POST /api/admin/fiscal/cases/:id/evidence: cuerpo binario limitado durante lectura, referencia en x-fiscal-source-reference.
- GET /api/admin/fiscal/cases/:id/evidence/:evidenceId: descarga administrativa, adjunto, no-store, URL firmada 60 segundos.
- /admin/fiscal y /admin/fiscal/cases/:id: interfaz administrativa.
- APIs/consulta legacy se conservan separadas y no habilitan emisión.

Todas las rutas exigen admin mediante Better Auth; no se habilita acceso implícito a clientes, vendors o staff. Mutaciones validan Origin y bloqueo demo, límites de cuerpo/rate limiting. IDs, versión, estados y cuerpos son estrictos. Campos de captura no permiten secretos ni certificados. Los errores nuevos no devuelven documentos ni errores del proveedor.

## Evidencia
Se reutiliza StorageService sobre un bucket privado separado del público. Configuración sin separación se bloquea. El operador de infraestructura debe verificar ACL privadas reales; el nombre de bucket no prueba privacidad. Claves generadas por servidor fiscal-evidence/{caseId}/{uuid}.{ext}; no se permiten rutas arbitrarias. Se conserva hash, actor y fecha en MongoDB; solo admin obtiene URL firmada, compartible durante sus 60 segundos de vigencia. No hay escaneo antivirus/OCR ni autenticación criptográfica del origen: la procedencia es declarada y revisada por una persona. Archivos siempre como adjunto.

Una caída entre carga S3 e inserción de metadatos puede dejar un objeto huérfano. No se elimina automáticamente ante commit incierto para no perder evidencia válida. Revisar inventario/retención con el responsable; no ejecutar limpieza de bases reales desde tests.

## Medasoft y compatibilidad
El adaptador se conserva, sin red por defecto incluso si existen credenciales. Login/profile requieren conjuntamente FISCAL_PROVIDER_MODE=medasoft-sandbox y FISCAL_MEDASOFT_NETWORK=true; la configuración no se cambia en esta tarea. No hay ruta nueva que lo invoque. Los servicios legacy de transición también exigen ese modo. Emisión, queue/send y reconcile de proveedor siguen bloqueados en código aunque se habilite red sandbox. El flujo Facturador Gratuito no depende de estos flags.

No cambian pedidos, pagos, entrega, inventario, PDF comercial ni roles existentes. No se ejecutaron escrituras en Atlas, cambios de configuración ni push.
