import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

const baseURL = typeof window === "undefined" ? undefined : window.location.origin;

export const authClient = createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [
        adminClient()
    ]
});

type SessionLike = {
    user?: {
        id?: string | null;
    } | null;
} | null | undefined;

export function isAuthenticatedSession(session: SessionLike): session is {
    user: {
        id: string;
    };
} {
    return typeof session?.user?.id === "string" && session.user.id.length > 0;
}
