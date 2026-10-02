"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";
import { clientIp, ipHash } from "@/lib/visitor";

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  const error = await login(
    String(form.get("identifier") ?? ""),
    String(form.get("password") ?? ""),
    ipHash(clientIp(await headers())),
  );
  if (error) return error;
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}
