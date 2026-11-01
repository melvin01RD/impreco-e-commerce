# Verificación y preparación de QA

Fecha: 2026-11-01. No se emitió ningún comprobante ni se utilizó Atlas/credenciales reales en pruebas. Rama de entrega `DGII-electronic-invoicing`; destino de revisión `qa`, sin PR ni merge autorizado.

## Comandos reproducibles

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test:fiscal
corepack pnpm test:fiscal:integration
corepack pnpm test:e2e:fiscal
node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit
corepack pnpm lint
node scripts/fiscal-qa-server.mjs build
$env:NEXT_DIST_DIR='.next-fiscal-build'
node scripts/check-dynamic-chunks.mjs
```

Corepack usa pnpm 10.24.0. `pnpm` sin Corepack no está en PATH de este equipo. En una instalación con pnpm disponible pueden ejecutarse los scripts habituales directamente.

La suite unitaria usa `node:test` con TypeScript mediante tsx y el adaptador CLI existente para módulos server-only. La integración crea una réplica temporal MongoDB 8.0.17 y no lee `.env`. La primera ejecución descarga el binario oficial en `node_modules/.cache/mongodb-binaries`.

Playwright Test usa TypeScript y pruebas HTTP reales contra Next y Better Auth. El servidor de prueba crea otra réplica temporal, usuarios sintéticos y un secreto efímero; limpia las claves de configuración locales del entorno hijo antes de que Next procese dotenv. No usa cuentas reales ni servicios de pago. Puerto exclusivo 3197, sin reutilizar servidores existentes. En Windows restringido puede requerir autorización de procesos para que Playwright cierre el árbol de Next al finalizar.

El build aislado ejecuta `next build --webpack` con dos workers en `.next-fiscal-build`, usando base temporal y configuración sin servicios externos. Es una compilación de producción local, no un despliegue. El script normal `pnpm build` usa otro bundler y no se ejecutó como tal. La validación de chunks se ejecuta por separado. La configuración preexistente de Next omite TypeScript durante build; por eso se ejecuta `tsc` aparte.

## Resultados comprobados

| Verificación | Resultado |
| --- | --- |
| Unitarias | 19/19 aprobadas |
| Integración replica set | Aprobada: índices, concurrencia, inmutabilidad, rollback, idempotencia, reserva E34, E33 y orígenes E41/E43/E45 |
| TypeScript completo | Aprobado con heap 6144 MiB |
| Lint completo | Aprobado tras corrección de importaciones según reglas del repositorio |
| Build aislado webpack | Aprobado; 294 páginas estáticas generadas |
| Chunks del build | Aprobado; sin referencias faltantes reportadas |
| Playwright | 6/6 aprobadas en 1,2 minutos: anónimo, cliente, administrador, filtros/página, métodos GET sin escritura y dos descargas reales de PDF sin emisión fiscal |

Advertencias del build: dependencia opcional `lna` de `qz-tray` no resuelta; avisos de caché webpack/next-intl. No son errores fiscales, pero deben revisarse para impresión POS. No se afirma que el build sustituyó el chequeo TypeScript.

Prueba inicial MongoDB descubrió la omisión silenciosa de cambios inmutables de Mongoose; corregida con guards explícitos, y reejecutada con éxito. El primer TypeScript agotó el heap original; aprobado con memoria ampliada. Un intento de TypeScript coincidió con reinstalación de enlaces pnpm y falló en el launcher Windows; la comprobación directa posterior pasó.

La prueba HTTP de página detectó redirección recursiva al escuchar Next en `127.0.0.1` y reescribir a `localhost`. Se alinearon servidor, baseURL y origen en `localhost`; las seis pruebas pasaron sin cambiar `proxy.ts`. La instrumentación temporal fue retirada. Una prueba diagnóstica contra `next start` no llegó a ejecutar la suite por conexión fallida a su base temporal; no se cuenta como validación del servidor de producción. El resultado E2E final corresponde a Next dev y el build se verificó por separado.

## Límites de la evidencia

Los tests del cálculo comercial y del constructor PDF prueban casos específicos. Playwright sí descargó dos PDFs reales y verificó formato/contenido binario básico y ausencia de emisión. No se ejecutó una compra completa con pago/inventario ni se certificó un flujo fiscal completo. No se validaron visualmente los PDFs ni la interfaz en un navegador disponible. Las pruebas HTTP de página no sustituyen verificación visual. No hay fixtures contractuales Medasoft aprobados ni emisiones Sandbox.

## Preparación para QA

1. Revisar los commits y `traceability.md`; aceptar explícitamente el alcance parcial y bloqueos antes de integrar a `qa`.
2. Provisionar una BD QA replica set aislada. No apuntar pruebas a Atlas productivo. Configurar autenticación de QA con secreto propio.
3. Revisar índices sin escribir: `corepack pnpm exec tsx scripts/prepare-fiscal-indexes.ts`.
4. Con variables QA suministradas al proceso, ejecutar `corepack pnpm exec tsx scripts/prepare-fiscal-indexes.ts --apply`. Solo crea índices, no elimina índices/datos. No se ejecutó contra QA durante esta entrega.
5. Ejecutar las verificaciones anteriores. Iniciar el app en QA con el procedimiento habitual del repositorio; no habilitar emisión ni cron fiscal.
6. Como administrador, abrir `/admin/fiscal`: siete tipos no habilitados, filtros y trazabilidad. Comprobar 401 anónimo y 403 cliente para las rutas fiscales.
7. Validar con el proveedor contrato/numeración/reconciliación, emisor y clasificación; implementar los pendientes de cada ticket y ejecutar certificación Sandbox antes de habilitar cualquier tipo.

Reversión de una integración QA: retirar las rutas/puentes fiscales mediante revisión de código; conservar colecciones/evidencia fiscal. No borrar documentos para resolver duplicados. Producción requiere todos los pendientes de `traceability.md`, reglas/retención aprobadas, RI/XML, permisos operativos y regresión integral.
