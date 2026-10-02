import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/admin");
  return (
    <div className="adm-card" style={{ maxWidth: 380, margin: "60px auto" }}>
      <h1>Anmelden</h1>
      <LoginForm />
    </div>
  );
}
