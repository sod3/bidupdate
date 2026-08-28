import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
  ) {
    super(message);
  }
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError("Content-Type must be application/json.", 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const input = await request.json().catch(() => {
    throw new ApiError("Request body is not valid JSON.", 400, "INVALID_JSON");
  });
  return schema.parse(input);
}

export function assertSameOrigin(request: Request) {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new ApiError("Cross-origin request rejected.", 403, "CSRF_REJECTED");
  }
  if (!origin) return;
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const requestHost = request.headers.get("host")?.trim() || forwardedHost || new URL(request.url).host;
    if (new URL(origin).host !== requestHost) {
      throw new ApiError("Cross-origin request rejected.", 403, "CSRF_REJECTED");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Invalid request origin.", 403, "CSRF_REJECTED");
  }
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return noStoreJson(
      { error: "Check the submitted fields.", code: "VALIDATION_ERROR", fields: error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (error instanceof ApiError) {
    return noStoreJson({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    return noStoreJson({ error: "That record already exists.", code: "DUPLICATE_RECORD" }, { status: 409 });
  }
  return noStoreJson({ error: "The server could not complete this request.", code: "INTERNAL_ERROR" }, { status: 500 });
}
