# Adaptador Medasoft — contrato parcial

Consultado el 2026-11-01: [autenticación](https://portal.medasoftfe.com/docs/integration/authentication/), [emisión](https://portal.medasoftfe.com/docs/integration/documents/), [estructura](https://portal.medasoftfe.com/docs/integration/document-format/).

Se implementaron solamente `POST https://medasoftfe.com/login` con `apiKey`/`apiSecret` y `GET /company/me` con Bearer, según la documentación. Validación Zod, timeout total incluso durante lectura del cuerpo, límite 64 KiB, sin redirecciones, sin logs de payload/token y sin reintento automático. La verificación exige `testecf`, empresa activa y RNC esperado. Certificación `certecf` y producción `ecf` son rechazadas. No se efectuó ninguna llamada autenticada real.

Variables de servidor (no NEXT_PUBLIC, sin valores en repositorio):

| Variable | Uso |
| --- | --- |
| `MEDASOFT_SANDBOX_API_KEY` | Credencial Sandbox suministrada por proveedor |
| `MEDASOFT_SANDBOX_API_SECRET` | Secreto Sandbox |
| `MEDASOFT_SANDBOX_ISSUER_RNC` | Identidad esperada contra `/company/me` |

No existe configuración ejecutable de producción en esta entrega. Los modelos distinguen ambientes; futuros secretos de producción deben ser distintos y validar `ecf` expresamente. La documentación indica el mismo host para ambientes, por lo que cambiar URL no aísla el entorno.

`issue` y `reconcile` fallan con `PROVIDER_UNVERIFIED` antes de HTTP. No se implementó un mapper de solicitud incompleto. Se normalizan únicamente respuestas documentadas para pruebas; respuesta desconocida → `OUTCOME_UNKNOWN`. Firma/QR o HTTP 200 no sustituyen `estado`.

## Bloqueos concretos

- La referencia `/api-docs` no expuso contenido legible y no había navegador conectado. Se consultaron las guías públicas, no un OpenAPI exportado/versionado.
- La guía estructural incluye `FechaEmision` en `IdDoc` mientras el formato DGII la ubica en Emisor. Confirmar payload efectivo por tipo con fixtures del proveedor.
- e-NCF se valida como E + tipo + diez dígitos (13 caracteres), consistente con el ejemplo `E310000000001`. Este control de estructura no demuestra autorización o disponibilidad de la secuencia.
- El ejemplo exige un e-NCF de entrada. No se verificó quién reserva/asigna la secuencia autorizada ni su contrato concurrente.
- Se conoce la existencia de `/reports/encf`, pero no se verificó un contrato de búsqueda inequívoca y reconciliación tras pérdida de respuesta. Nunca emitir de nuevo por timeout.
- Pendientes: Sandbox provisionado, fixtures contractuales, credenciales de prueba, clasificación y autorización del emisor. Los mocks no constituyen certificación.

La documentación DGII adicional mencionada por el usuario no fue entregada como archivo; el enlace recibido fue el portal público Medasoft.
