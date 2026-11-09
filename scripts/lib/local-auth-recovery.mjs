import { betterAuth } from "better-auth";

/** Break-glass local operator flow. Caller must verify identity and authorization
 * BEFORE constructing this instance. Never mount its handler on a web server.
 * Password hashing and updates are exclusively performed by Better Auth APIs. */
export function createLocalRecovery({ database, secret, targetId, email, minPasswordLength }) {
  let token;
  const auth = betterAuth({
    database,
    secret,
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    logger: { disabled: true },
    databaseHooks: {
      user: { create: { before: async () => { throw new Error("EXISTING_USER_REQUIRED"); } } },
      account: { create: { before: async () => { throw new Error("EXISTING_CREDENTIAL_REQUIRED"); } } },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 300,
      revokeSessionsOnPasswordReset: true,
      // This is NOT email delivery or proof of identity. An independently
      // verified local operator supplies that authorization before this flow.
      sendResetPassword: async (data) => {
        token = data.token;
        if (data.user.id !== targetId || data.user.email !== email) throw new Error("TARGET_CHANGED");
      },
    },
  });
  return {
    async reset(newPassword) {
      try {
        await auth.api.requestPasswordReset({ body: { email } });
        if (!token) throw new Error("RESET_NOT_ISSUED");
        await auth.api.resetPassword({ body: { token, newPassword } });
      } finally {
        // Also clean up a token when reset fails. No raw token escapes here.
        if (token) {
          const ctx = await auth.$context;
          await ctx.internalAdapter.deleteVerificationByIdentifier(`reset-password:${token}`);
        }
        token = undefined;
      }
    },
  };
}
