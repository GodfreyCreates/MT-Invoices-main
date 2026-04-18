import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

const baseURL = typeof window === "undefined" ? undefined : window.location.origin;

export const authClient = createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [
        adminClient()
    ]
});
