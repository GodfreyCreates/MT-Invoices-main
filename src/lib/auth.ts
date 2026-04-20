import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "../db";
import { user } from "../db/auth-schema";
import { count } from "drizzle-orm";
import { sendAccountVerificationEmail } from "../email";
import { getAuthBaseUrlConfig, getAuthSecret, getTrustedOrigins, toPublicAppUrl } from "./server-env";

const trustedOrigins = getTrustedOrigins();

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg", // or "sqlite"
    }),
    baseURL: getAuthBaseUrlConfig(),
    secret: getAuthSecret(),
    advanced: {
        ipAddress: {
            ipAddressHeaders: ["x-client-ip"],
        },
    },
    emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        autoSignIn: false,
        requireEmailVerification: true,
    },
    emailVerification: {
        autoSignInAfterVerification: true,
        sendOnSignIn: false,
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user, url }) => {
            await sendAccountVerificationEmail({
                email: user.email,
                name: user.name,
                verificationUrl: toPublicAppUrl(url),
            });
        },
    },
    trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
    plugins: [
        admin()
    ],
    databaseHooks: {
        user: {
            create: {
                before: async (userData) => {
                    const [{ count: userCount }] = await db.select({ count: count() }).from(user);
                    if (userCount === 0) {
                        return {
                            data: {
                                ...userData,
                                role: "admin"
                            }
                        };
                    }
                    return { data: userData };
                }
            }
        }
    }
});
