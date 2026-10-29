"use client";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    headers: init?.form ? undefined : { "content-type": "application/json" },
    body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
  });
  let json: { data?: T; error?: { code: string; message: string } };
  try {
    json = await res.json();
  } catch {
    throw new ApiError("INTERNAL_ERROR", `Server returned ${res.status}`);
  }
  if (json.error) throw new ApiError(json.error.code, json.error.message);
  return json.data as T;
}
