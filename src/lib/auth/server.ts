import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { hasDatabase, prisma } from '@/lib/server/db';
import { sendMail } from '@/lib/server/mail';

// Optional accounts (SPEC §7.19, D-006): email + password, password reset by email, optional
// email verification, account deletion. Better Auth's defaults: scrypt password hashing,
// httpOnly secure session cookies, CSRF checks on its endpoints, rate limiting.

function createAuth() {
  return betterAuth({
    appName: 'Noor',
    database: prismaAdapter(prisma(), { provider: 'postgresql' }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Noor — إعادة تعيين كلمة المرور / Password reset',
          text: `لإعادة تعيين كلمة المرور افتح الرابط التالي (صالح لمدة ساعة):\n${url}\n\nTo reset your password, open this link (valid for one hour):\n${url}\n\nإن لم تطلب ذلك فتجاهل هذه الرسالة. / If you did not ask for this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Noor — تأكيد البريد الإلكتروني / Confirm your email',
          text: `لتأكيد بريدك الإلكتروني افتح الرابط:\n${url}\n\nTo confirm your email, open:\n${url}`,
        });
      },
    },
    user: { deleteUser: { enabled: true } },
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: { cookiePrefix: 'noor' },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { noorAuth?: Auth };

/** The auth instance, or null when no database is configured (accounts disabled). */
export function getAuth(): Auth | null {
  if (!hasDatabase()) return null;
  globalForAuth.noorAuth ??= createAuth();
  return globalForAuth.noorAuth;
}
