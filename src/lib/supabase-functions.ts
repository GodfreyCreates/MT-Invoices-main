import { supabase } from './supabase';

type FunctionErrorPayload = {
  error?: string;
};

type InvokeFunctionOptions = {
  accessToken?: string | null;
  body?: unknown;
  method?: 'POST' | 'DELETE';
};

export function getSupabaseFunctionUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

export function createSupabaseFunctionHeaders(accessToken?: string | null) {
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function getFunctionErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as FunctionErrorPayload;
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // Ignore non-JSON function errors.
  }

  return response.statusText || 'Function request failed';
}

export async function invokeSupabaseFunction<T>(
  name: string,
  { accessToken, body, method = 'POST' }: InvokeFunctionOptions = {},
): Promise<T> {
  const functionUrl = getSupabaseFunctionUrl(name);
  const headers = new Headers(createSupabaseFunctionHeaders(accessToken));

  let requestBody: BodyInit | undefined;
  if (typeof body !== 'undefined') {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(functionUrl, {
    method,
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error(await getFunctionErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function invokeSupabaseFunctionWithSession<T>(
  name: string,
  body?: unknown,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  return invokeSupabaseFunction<T>(name, {
    accessToken: data.session?.access_token ?? null,
    body,
    method,
  });
}
