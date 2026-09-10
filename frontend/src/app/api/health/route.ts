import { NextResponse } from "next/server";

export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:4000";

  try {
    const res = await fetch(`${backendUrl}/health`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          status: "error",
          statusCode: res.status,
          message: `Backend returned HTTP ${res.status}: ${res.statusText}`,
          targetUrl: `${backendUrl}/health`,
        },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to connect";
    return NextResponse.json(
      {
        status: "offline",
        message: errorMsg,
        targetUrl: `${backendUrl}/health`,
        isLocalhostOnCloud:
          typeof window === "undefined" &&
          backendUrl.includes("localhost") &&
          process.env.VERCEL === "1",
      },
      { status: 503 },
    );
  }
}
