# IMP-AUTH-018 — Preview authentication and account recovery

## Evidence and limits

Authorized Preview origin supplied by the owner:
`https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app`
(`/login` is a page, not part of the origin).

The browser auth client uses `window.location.origin`. Previously the server
trusted only `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, its base URL and configured
mobile app schemes. A public Preview domain missing from that list receives
`INVALID_ORIGIN`, regardless of whether its password is correct. No automatic
Vercel domain discovery was configured. Both URL variables are
`http://localhost:3000` locally. **The owner also supplied those exact values
for Preview**, confirming the mismatch with the HTTPS browser origin. Remote
values were supplied by the owner rather than read through the Vercel API:
no Vercel connection/CLI credentials are available in this session.

`Too many attempts` is a separate protection. Better Auth allows 8 email sign-in
requests per 60-second window using MongoDB-backed counters. A separate
email/IP account lockout records credential failures (401), not invalid-origin
responses (403). Its policy comes from Security settings. Without the exact
response code/headers or remote logs, we cannot attribute the reported message
to one counter. Honor `Retry-After` / `X-Retry-After`; do not clear counters,
rotate IPs, increase thresholds or repeatedly retry.

Read-only checks succeeded against **storify_catalina_dev**. Its settings have
email disabled, no usable stored SMTP credentials, and no recorded SMTP
verification. Local SMTP environment variables are absent. Vercel-only SMTP
variables remain unverified; a working provider cannot currently be claimed.
No reset request or email has been sent and the user's password is unchanged.

## Prepared code change

`BETTER_AUTH_TRUSTED_ORIGINS` adds exact, validated HTTPS origins. Wildcards,
credentials, URL paths, queries, fragments and private hosts are rejected without
echoing values. Hosted deployments do not add origins based on incoming Host or
Origin headers. Local same-host LAN behavior and existing mobile schemes remain.
No CSRF, rate-limit, password, user-role or fiscal settings were disabled/changed.

Files:

- `lib/auth/trusted-origins.ts`: exact-origin validation and resolver.
- `lib/auth/auth.ts`: wire the optional allowlist into Better Auth.
- `.env.example`: document the optional server-only variable.
- `tests/preview-auth.test.ts`: validation, host spoofing, LAN and Better Auth tests.
- `docs/IMP-AUTH-018.md`: evidence, Preview settings and recovery proposal.

## Vercel variables to review/set in Preview scope only

```dotenv
BETTER_AUTH_URL=https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app
NEXT_PUBLIC_APP_URL=https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app
MONGODB_DB_NAME=storify_catalina_dev
FISCAL_PROVIDER_MODE=dgii-free
FISCAL_MEDASOFT_NETWORK=false
```

Keep the existing valid `MONGODB_URI` and strong `BETTER_AUTH_SECRET` private and
unchanged. Do not copy the local localhost URLs into Preview. When both URL
variables already name the domain in use, **no extra origin is necessary**.
If a distinct canonical Preview alias is used, explicitly authorize only the
additional supplied origin with:

```dotenv
BETTER_AUTH_TRUSTED_ORIGINS=https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app
```

Never use `*.vercel.app` or infer trust from request headers. Deployment-specific
URLs can change: choose an owner-authorized stable Preview alias as canonical
when available, then update the exact allowlist deliberately. Environment
changes require a subsequent deployment; none was triggered by this task.

Mail requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`
in Preview scope, or equivalent enabled settings in the existing database.
Use the existing mail resolver: port 465 uses TLS, 587 requires STARTTLS.
Verify SMTP authentication once and then delivery once to the owner's confirmed
address. Do not put credentials in source, this document, chat or logs.

## Minimum recovery proposal (not executed)

The current `/forgot-password` UI calls a custom route, creating temporary,
atomically consumed `PasswordReset` tokens. The custom `/api/auth/reset-password`
route shadows Better Auth's endpoint and calls `upsertCredentialPassword`, which
directly writes the MongoDB credential hash. Better Auth has no configured
`sendResetPassword`. Consequently, calling the current recovery UI does **not**
satisfy the requirement to use the official Better Auth reset endpoint.

After configuring/verifying SMTP, implement this targeted integration:

1. Configure `emailAndPassword.sendResetPassword`,
   `resetPasswordTokenExpiresIn: 3600` and `revokeSessionsOnPasswordReset: true`.
   Use the existing SMTP resolver and sanitized failure handling. Do not log
   the token, reset URL, email content or new password. Reject banned accounts
   as the current recovery flow does.
2. Wire self-service recovery to the official `requestPasswordReset` endpoint.
   Add the intended 5-per-900-second custom limit to `/request-password-reset`:
   the existing `/forget-password` entry does not name the installed endpoint.
   Retain the existing per-address/IP controls and generic anti-enumeration
   response. Do not weaken any sign-in limits.
3. Resolve the static `/api/auth/reset-password` route collision explicitly:
   delegate official tokens and `newPassword` to the existing guarded catch-all
   Better Auth handler (CSRF, rate limiting and password policy included).
   Preserve the existing customer/vendor invitation flows separately; their
   custom tokens cannot be passed to Better Auth as if they were official tokens.
4. Update the reset page and token validation to support the official flow.
   For email links, place the token in a URL fragment, read it client-side and
   remove it from browser history; POST it in the body. This avoids putting a
   reset token in access-log paths/query strings. Never log request bodies.
5. Let Better Auth consume the expiring token and update the credential using
   its adapter. Keep the same user ID, role(s) and permissions. Revoke all
   existing sessions on success and invalidate older custom invitation/reset
   links so they cannot overwrite the recovered password later.
6. Test expiry, replay/concurrent consumption, untrusted origins, password
   policy, role/ID preservation and session revocation with isolated fixtures.
   Do not use the real administrator for negative login tests.

Installed Better Auth 1.6.33 uses `consumeVerificationValue` for one-time tokens
and supports `revokeSessionsOnPasswordReset`. This app has MongoDB adapter
transactions disabled; do not claim password update and session revocation are
transactionally atomic. Test failure handling before enabling the flow.

Reference: https://better-auth.com/docs/authentication/email-password

## Validation

- `corepack pnpm db:check`: real Atlas read succeeded; no writes.
- SMTP settings inspection: read-only, output limited to presence booleans.
- ESLint on the three changed TypeScript files: passed.
- Full TypeScript check: passed with
  `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false`.
  The initial default-heap run exhausted Node's memory; the larger-heap run
  completed without diagnostics.
- `git diff --check`: passed.
- `node --import tsx --test tests/preview-auth.test.ts`: 5 tests passed.
  Better Auth itself rejects an unlisted Vercel origin (403/INVALID_ORIGIN),
  while the explicit authorized origin reaches credential validation (401 for
  a synthetic nonexistent account). All requests remain in memory, CSRF and
  rate limiting enabled; no real login attempts.
- Applying the corrected Preview variables, actual SMTP delivery, real password reset and
  subsequent session revocation remain pending. No database/user creation,
  direct hash edits, commits, pushes or deployments were performed.
