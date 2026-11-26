export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) {
      const field = Array.isArray(detail[0].loc) ? detail[0].loc[detail[0].loc.length - 1] : "";
      return `${field ? `${String(field).replace(/_/g, " ")}: ` : ""}${detail[0].msg}`;
    }
  }
  if (status >= 500) return "The server could not complete the request. Please try again.";
  return "Something went wrong. Please try again.";
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = opts.body || opts.form ? "POST" : "GET", body, form, signal } = opts;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running.");
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/mfa")) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  if (!res.ok) throw new ApiError(res.status, messageFrom(data, res.status));
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
