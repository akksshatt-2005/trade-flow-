import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAnon, toInternalEmail } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return NextResponse.json(
        { message: "Username must be at least 3 characters long." },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters long." },
        { status: 400 },
      );
    }

    const normalizedUsername = username.trim().toLowerCase();
    const internalEmail = toInternalEmail(normalizedUsername);

    // 1. Check if username exists in public.users
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { message: `Username '${username}' is already taken.` },
        { status: 409 },
      );
    }

    // 2. Create in Supabase Auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: password,
        email_confirm: true,
        user_metadata: { username: normalizedUsername },
      });

    if (authError || !authData.user) {
      if (authError?.message?.includes("already registered")) {
        return NextResponse.json(
          { message: `Username '${username}' is already taken.` },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { message: authError?.message || "Registration failed." },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    // 3. Mirror in public.users (NO password_hash)
    const { error: profileError } = await supabaseAdmin.from("users").insert({
      id: userId,
      username: normalizedUsername,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
      return NextResponse.json(
        { message: "Failed to initialize user profile." },
        { status: 500 },
      );
    }

    // 4. Issue session
    const { data: loginData } = await supabaseAnon.auth.signInWithPassword({
      email: internalEmail,
      password: password,
    });

    return NextResponse.json(
      {
        access_token: loginData?.session?.access_token || "",
        refresh_token: loginData?.session?.refresh_token || "",
        user: {
          id: userId,
          username: normalizedUsername,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "Internal server error." },
      { status: 500 },
    );
  }
}
