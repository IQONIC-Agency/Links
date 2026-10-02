"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action}>
      <div className="field">
        <label>E-Mail (oder Benutzername)</label>
        <input type="text" name="identifier" autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label>Passwort</label>
        <input type="password" name="password" autoComplete="current-password" required />
      </div>
      {error ? <p style={{ color: "#c22" }}>{error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Prüfe…" : "Anmelden"}
      </button>
    </form>
  );
}
