# Fiscal IMPRECO — Facturador Gratuito DGII
La operación actual es manual: IMPRECO prepara el expediente comercial y DGII emite el e-CF en su Facturador Gratuito. No existe integración API directa, emisión desde checkout ni consulta automatizada de DGII.

Abrir /admin/fiscal como administrador:

1. Cargar pedido y clasificar líneas; preparar sin emitir.
2. Copiar datos hacia DGII y completar allí la emisión.
3. Adjuntar evidencia oficial privada y registrar e-NCF/estado/importes.
4. Verificar manualmente la evidencia y conciliar contra snapshot.
5. Conservar el historial al corregir. No borrar pedidos ni comprobantes para solucionar conflictos.

El e-NCF y estado DGII son datos transcritos del origen oficial. Registrar ACEPTADO no concilia ni prueba una validación automática. No introducir credenciales ni certificados DGII.

Leer [arquitectura](architecture.md), [auditoría IMP-FE-015](IMP-FE-015-audit.md), [pruebas](qa.md), [trazabilidad](traceability.md) y [reporte de entrega](IMP-FE-015-delivery.md). Documentación anterior de Medasoft se conserva como referencia del prototipo aislado, no como instrucciones de operación de Catalina.

## Preparación de índices (operador, después de revisión)
Sin conectar a base: `node --require ./scripts/lib/finance-cli.cjs --import tsx scripts/prepare-fiscal-indexes.ts`.
El comando muestra definiciones. La opción --apply requiere configuración y autorización operativa explícita; no fue ejecutada contra una base real. Crea índices de forma aditiva, no borra ni convierte datos.

Se necesita replica set para transacciones y StorageService con bucket privado separado. Revisar índices antes de exponer rutas con MONGODB_AUTO_INDEX deshabilitado. Los tests usan MongoDB temporal y un servidor S3 simulado en loopback; no necesitan secretos reales.
