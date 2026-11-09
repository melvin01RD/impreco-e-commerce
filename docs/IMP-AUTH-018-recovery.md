# IMP-AUTH-018 — Recuperación administrativa local

Fecha: 2026-11-09. Base exclusiva: `storify_catalina_dev`.

## Diagnóstico comprobado

- Atlas acepta la conexión local y las lecturas.
- Existe exactamente un `melvin01rd@gmail.com`, ID
  `6ad19767a6d56eabba338093`, estado `active`, `role: admin`,
  `roles: ["admin"]`, correo verificado, sin segundo factor.
- Existe una cuenta `credential`, vinculada mediante ObjectId, con contraseña.
  MongoDB proyectó únicamente un booleano de presencia: no se recuperó el hash.
- Hay una sesión activa. No se ha revocado ni cambiado la contraseña real.
- SMTP no está configurado en los ajustes DEV ni en el entorno local.
  No se han comprobado variables SMTP remotas ni enviado correos.
- `BETTER_AUTH_SECRET` local pasa la validación mínima del proyecto: presente,
  longitud mínima y sin placeholders conocidos. Esto no prueba aleatoriedad ni
  que Vercel tenga el mismo valor. No se imprimió su valor ni su huella.
- Las URLs locales son localhost. El propietario también proporcionó esos
  valores para Preview en la revisión anterior: ese origen no coincide con el
  dominio HTTPS usado por el navegador y explica `Invalid origin`.
- El GET anónimo a `/api/auth/get-session` del Preview responde 302 hacia la
  autenticación de **vercel.com**. La protección de despliegue impide confirmar
  desde esta sesión la conexión MongoDB remota, login o páginas administrativas.
  Esta barrera es distinta de la autenticación de IMPRECO.

## Corregir Preview, sin ampliar confianza a otros dominios

En Vercel → proyecto IMPRECO → Settings → Environment Variables, alcance
**Preview** (y el override de rama correspondiente, si existe), guardar:

```dotenv
BETTER_AUTH_URL=https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app
NEXT_PUBLIC_APP_URL=https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app
MONGODB_DB_NAME=storify_catalina_dev
FISCAL_PROVIDER_MODE=dgii-free
FISCAL_MEDASOFT_NETWORK=false
```

No añadir `/login`, `/es` ni comodines. Comprobar que `BETTER_AUTH_SECRET` está
definido en ese mismo alcance, contiene un secreto fuerte y estable (al menos
32 caracteres) y no un placeholder. No copiar su valor al chat ni rotarlo como
remedio de `Invalid origin`. Conservar la URI Atlas privada de esta base.

La allowlist estricta preparada anteriormente en `lib/auth/trusted-origins.ts`
ya forma parte del árbol actual. Con ambas URLs en este dominio no hace falta
`BETTER_AUTH_TRUSTED_ORIGINS`. Si se utiliza otro alias canónico autorizado,
añadir únicamente el origen adicional exacto; nunca `*.vercel.app`.

Los cambios de variables no alteran un deployment existente. Requieren un
deployment posterior **autorizado y realizado manualmente**. El hostname de un
nuevo deployment puede cambiar: comprobar su origen exacto o usar un alias
Preview estable autorizado. No se cambiaron variables remotas ni se desplegó
desde esta tarea. Mantener CSRF, rate limiting y protección de Vercel activos.

## Elección del mecanismo

Prioridad: recuperación oficial por correo cuando SMTP esté habilitado y
verificado. La propuesta para integrarla está en `IMP-AUTH-018.md`; la ruta
personalizada actual no es el endpoint oficial y escribe el hash directamente.
**No usar `pnpm link-credential`, `create-admin` ni la recuperación personalizada
para esta intervención.** El primero también acepta la contraseña como argumento.

Sin correo funcional, se preparó una alternativa de emergencia **local**, sin
servidor HTTP ni endpoint público. La versión instalada, Better Auth 1.6.33,
admite `requestPasswordReset` y `resetPassword`. La utilidad llama ambas APIs;
el callback recibe el token solo en memoria, sin enviarlo, imprimirlo ni
devolverlo. El token dura cinco minutos y se consume una sola vez. La prueba
de identidad no la aporta ese callback: debe completarse previamente.

## Autorización y verificación de identidad obligatorias

1. El responsable del proyecto verifica al propietario por un canal independiente:
   control de la cuenta Vercel/GitHub ya reconocida del proyecto y verificación
   por un canal de contacto previamente establecido. Conocer el correo o poder
   escribir la confirmación del script **no** es prueba de identidad.
2. Registrar fuera del repositorio la autorización, responsable que verificó,
   fecha, ID del usuario y alcance de la intervención. No registrar contraseña,
   token, hash ni credenciales de infraestructura.
3. Solo el propietario/operador autorizado ejecuta los pasos siguientes en su
   terminal local privada, sin grabación ni captura de teclas. No ejecutarlos
   en una terminal del agente, sesión compartida o con transcripción habilitada.
   Si no puede verificarse la identidad, detener la recuperación.

## Pasos exactos en PowerShell

Abrir una terminal propia, con Node.js y las dependencias ya instaladas:

```powershell
Set-Location 'C:\Users\melvi\Documents\storify e-commerce\Storify-main-app-v3.0'
node --import tsx scripts/inspect-admin-access.mjs
```

La inspección es de solo lectura. Debe mostrar el mismo usuario, ID, rol y base.
La configuración `.env` existente sigue siendo local; no sustituir sus URLs
localhost por URLs de Preview para ejecutar este procedimiento.

Después de completar la verificación y autorización anteriores:

```powershell
node --import tsx scripts/recover-existing-admin.mjs --execute
```

En el prompt local oculto, escribir `AUTORIZO melvin01rd@gmail.com`. Después
introducir dos veces una contraseña nueva y única generada por un gestor,
de al menos 16 caracteres (o el mínimo superior configurado), con mayúscula,
número y carácter especial. No se muestran caracteres ni asteriscos.
No se admite contraseña en argumentos, variables de entorno, archivos o stdin
redirigido. No introducirla en este chat. Se puede cancelar con Ctrl+C antes
de la fase de mutación.

La utilidad:

- Rechaza otra base, otro ID, usuario duplicado/inactivo/no administrador,
  credencial ausente/duplicada o una vinculación incompatible.
- No crea usuarios ni cuentas; verifica que el ID de la credencial se conserva.
- Aplica la política del proyecto y el mínimo reforzado de recuperación.
- Invalida los enlaces anteriores del usuario antes de emitir el nuevo token.
- Deja a Better Auth generar/consumir el token, calcular y guardar la contraseña
  y revocar las sesiones. No calcula ni actualiza hashes mediante MongoDB.
- Comprueba que ID, roles, permisos, estado, correo verificado y segundo factor
  no cambiaron y que no quedan sesiones almacenadas del usuario.
- Solo toca las colecciones de autenticación/recuperación. No importa modelos
  de negocio ni código fiscal y no ejecuta seeds, índices o migraciones.

No hay transacción global entre cambio de contraseña y revocación en este flujo
instalado. Si la utilidad informa fallo tras comenzar la mutación, no asumir que
hubo rollback ni reintentar automáticamente: repetir la inspección de solo
lectura y revisar las sesiones antes de continuar. El script no borra los
contadores de intentos ni desactiva 2FA.

## Validación posterior por el propietario

1. Repetir `node --import tsx scripts/inspect-admin-access.mjs`: mismo ID/roles,
   una cuenta de credenciales y cero sesiones antes del siguiente login.
2. Iniciar sesión en Vercel para superar la protección del deployment; no
   desactivarla. Abrir el Preview cuyo origen y variables hayan sido corregidos
   mediante un deployment manual autorizado.
3. Esperar el `Retry-After`/`X-Retry-After` si existe un bloqueo previo. Realizar
   **un solo** login con el correo existente y la nueva contraseña. Ante 429,
   esperar; ante `Invalid origin`, revisar URL/variables, no repetir contraseñas.
4. Confirmar el acceso a `/es/admin/dashboard` y `/es/admin/fiscal`. La página
   fiscal usa `requireAdminPageAccess` y exige una sesión administrativa real.
5. Comprobar una sesión nueva y que una sesión anterior ya no permite acceso.
   Mantener el mismo ID y roles. No editar pedidos, inventario ni expedientes
   fiscales para validar la autenticación.

El éxito del login, acceso administrativo/fiscal y conexión MongoDB **desde
Preview** quedan pendientes de estos pasos; no se presentan como verificados.

## Pruebas realizadas

- Inspección real de Atlas: lecturas correctas y usuario confirmado; sin escrituras.
- Prueba anónima Preview: 302 a autenticación de Vercel, sin cookies/credenciales.
- Tests con adaptador en memoria: recuperación oficial cambia la contraseña,
  conserva identidad/roles/permisos y la cuenta existente, revoca solo sesiones
  del objetivo, limpia el token, no crea un usuario ausente y no toca fixtures
  de pedidos/inventario/fiscal.
- Entrada oculta: no imprime caracteres; rechaza pipes y argumentos de contraseña.
- Better Auth instalado rechaza tokens expirados y su reutilización tras un reset.
- Diez pruebas pasan (cinco de recuperación y cinco de orígenes); ESLint de los
  archivos nuevos y `git diff --check` pasan.
- No se ha ejecutado `--execute` contra la base real ni realizado login con el
  administrador. Sin commits, push, despliegues o cambios fiscales.

Referencia oficial: https://better-auth.com/docs/authentication/email-password
La comprobación de compatibilidad se realizó también contra el código instalado
de 1.6.33, no solo contra la documentación web de versiones más recientes.
