import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Ready");

  const isAuthenticated = useMemo(() => !!sessionToken, [sessionToken]);

  useEffect(() => {
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      setSessionToken(data.session?.access_token ?? null);
    };
    void bootstrap();
  }, []);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(
      error
        ? `Sign up failed: ${error.message}`
        : "Sign up success. Check your email if confirmation is enabled.",
    );
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(`Sign in failed: ${error.message}`);
      return;
    }
    setSessionToken(data.session.access_token);
    setMessage("Signed in.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionToken(null);
    setMessage("Signed out.");
  };

  const callBackend = async (path: string, withAuth = false) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: withAuth && sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : undefined,
    });
    const json = (await response.json()) as Record<string, unknown>;
    setMessage(JSON.stringify(json, null, 2));
  };

  return (
    <main className="container">
      <h1>React + FastAPI + Supabase Template</h1>
      <p className="subtitle">A starter kit for quick app development.</p>

      <form className="card" onSubmit={handleSignIn}>
        <h2>Auth</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <div className="row">
          <button type="submit">Sign In</button>
          <button type="button" onClick={handleSignUp}>
            Sign Up
          </button>
          <button type="button" onClick={handleSignOut} disabled={!isAuthenticated}>
            Sign Out
          </button>
        </div>
      </form>

      <section className="card">
        <h2>API checks</h2>
        <div className="row">
          <button type="button" onClick={() => void callBackend("/api/health")}>
            GET /api/health
          </button>
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={() => void callBackend("/api/me", true)}
          >
            GET /api/me
          </button>
        </div>
      </section>

      <pre className="output">{message}</pre>
    </main>
  );
}

export default App;
