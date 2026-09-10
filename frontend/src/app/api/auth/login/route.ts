import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAnon, toInternalEmail } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { message: "Username and password are required." },
        { status: 400 },
      );
    }

    const normalizedUsername = username.trim().toLowerCase();
    const internalEmail = toInternalEmail(normalizedUsername);

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: internalEmail,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { message: "Invalid username or password." },
        { status: 401 },
      );
    }

    // Retrieve profile
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, username")
      .eq("id", data.user.id)
      .maybeSingle();

    return NextResponse.json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.user.id,
          username: profile?.username || normalizedUsername,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Login failed." },
      { status: 500 },
    );
  }
}
