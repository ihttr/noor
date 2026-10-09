'use client';

import { createAuthClient } from 'better-auth/client';

// Better Auth's browser client (same origin). Loaded only by the account pages.
export const authClient = createAuthClient();
