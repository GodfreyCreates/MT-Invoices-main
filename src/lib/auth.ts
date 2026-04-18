import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "../db";
import { user } from "../db/auth-schema";
import { count } from "drizzle-orm";
import { getAuthSecret, getBaseUrl, getTrustedOrigins } from "./server-env";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg", // or "sqlite"
    }),
    baseURL: getBaseUrl(),
    secret: getAuthSecret(),
    advanced: {
        ipAddress: {
            ipAddressHeaders: ["x-client-ip"],
        },
    },
    emailAndPassword: {
        enabled: true
    },
    trustedOrigins: getTrustedOrigins(),
    trustHost: false,
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
