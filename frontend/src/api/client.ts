const base = import.meta.env.VITE_API_BASE ?? "/api/v1";

function getToken(): string | null {
  return localStorage.getItem("finecta_token");
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; formData?: FormData } = {}
): Promise<T> {
  const { json, formData, ...rest } = init;
  const headers: HeadersInit = { ...(init.headers as Record<string, string>) };
  const tok = getToken();
  if (tok) (headers as Record<string, string>)["Authorization"] = `Bearer ${tok}`;

  let body: BodyInit | undefined;
  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const r = await fetch(`${base}${path}`, {
    ...rest,
    headers,
    body,
  });
  if (!r.ok) {
    let err = `${r.status}`;
    try {
      const j = (await r.json()) as { detail?: unknown };
      if (Array.isArray(j.detail)) {
        const first = j.detail[0] as { msg?: string; loc?: string[] } | string;
        err = typeof first === "string" ? first : (first?.msg ?? JSON.stringify(j));
      } else {
        err = (typeof j.detail === "string" ? j.detail : JSON.stringify(j)) ?? "Error";
      }
    } catch {
      /* no json */
    }
    throw new Error(err);
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export { base };
