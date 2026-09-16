"use client";

export type ApiPayload = Record<string, unknown>;

async function read(response: Response): Promise<ApiPayload> {
  const data = (await response.json().catch(() => ({}))) as ApiPayload;
  if (!response.ok) {
    const text = typeof data.error === "string" ? data.error : data.msg;
    throw new Error(typeof text === "string" ? text : "操作失败");
  }
  return data;
}

export async function getJson(url: string): Promise<ApiPayload> {
  return read(await fetch(url, { cache: "no-store" }));
}

export async function postJson(url: string, body?: unknown): Promise<ApiPayload> {
  return read(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  );
}

export async function deleteJson(url: string): Promise<ApiPayload> {
  return read(await fetch(url, { method: "DELETE" }));
}

export const errorText = (error: unknown, fallback = "操作失败") =>
  error instanceof Error && error.message ? error.message : fallback;

export const successText = (data: ApiPayload, fallback: string) =>
  typeof data.msg === "string" ? data.msg : fallback;

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
