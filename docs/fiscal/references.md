# Fuentes y bloqueos

Consultadas el 2026-11-01. Documentación web no equivale a prueba de contrato contra Sandbox.

- [DGII, documentación e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx): catálogo de formatos, XSD e instructivos.
- [Formato e-CF V1.0](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf): campos 38–40, identificación de comprador E32 desde DOP 250,000 y razón social; identificación extranjera tiene condiciones propias. Validación estructural no acredita inscripción/estatus tributario.
- [Medasoft, índice](https://portal.medasoftfe.com/docs/): guías por tipo.
- [Medasoft, API](https://portal.medasoftfe.com/docs/integration/overview/).
- [Medasoft, documentos](https://portal.medasoftfe.com/docs/integration/documents/): envío JSON, estados textuales, resultado desconocido no equiparable a rechazo. QR o firma por sí solos no demuestran aceptación.
- [Medasoft, estructura](https://portal.medasoftfe.com/docs/integration/document-format/).
- [Medasoft, precisión](https://portal.medasoftfe.com/docs/integration/rounding-tolerances/).
- [Medasoft, referencia API](https://portal.medasoftfe.com/api-docs): página sin contenido legible mediante la herramienta consultada.

Pendiente: contrato exportado/versionado y fixtures de Sandbox; mecanismo autorizado de asignación/reserva de e-NCF; consulta exacta de resultado por identificador estable; política de secuencia consumida/rechazo; clasificación aprobada de productos/transporte; emisor por vendedor; autorización de cada tipo; representación impresa validada. No crear endpoints, cabeceras de idempotencia ni payloads por analogía.
