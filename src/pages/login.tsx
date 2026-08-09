import Head from "next/head";
import Link from "next/link";
import React from "react";
import * as NotesApi from "../util/fetch";
import env from "@/util/config";

const Login: React.FC = () => {
  const [email, setEmail] = React.useState<string>("");
  const [password, setPassword] = React.useState<string>("");
  const [errMessage, setErrMessage] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);

  const loginClicked = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrMessage("");
    if (!email.trim() || !password) {
      setErrMessage("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      await NotesApi.loginUser({ email: email.trim(), password });
      window.location.replace("/notes");
    } catch (error) {
      setErrMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  function redirectToGoogleAuth() {
    window.location.href = env.SERVER_URL + "/api/auth/google";
  }

  return (
    <div>
      <Head>
        <title>ThyncSpace | Log In</title>
        <meta name="description" content="Log in to your ThyncSpace account." />
      </Head>

      {/* Page layout */}
      <div
        style={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background Graphic */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: 'url("/homepage.svg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: 0.1,
            zIndex: 0,
          }}
        />

        {/* Card */}
        <div
          className="glass-strong modal-panel"
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: "420px",
            padding: "2.5rem",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                display: "inline-flex",
                width: "48px",
                height: "48px",
                background: "var(--color-accent-blue)",
                borderRadius: "4px",
                border: "2px solid var(--color-bg)",
                boxShadow: "4px 4px 0px rgba(0,0,0,0.5)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 3H19a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4M12 17v-6m0 0V9m0 2H9m3 0h3"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1
              style={{
                fontSize: "1.6rem",
                fontWeight: 900,
                color: "var(--color-text)",
                marginBottom: "0.35rem",
                letterSpacing: "-0.02em",
              }}
            >
              Welcome back
            </h1>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Log in to continue to your notes
            </p>
          </div>

          {/* Form */}
          <form
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
            onSubmit={loginClicked}
          >
            <button
              type="button"
              className="btn-ghost"
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "0.95rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                background: "#fff",
                color: "#000",
                borderColor: "#fff",
              }}
              onClick={redirectToGoogleAuth}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
              </svg>
              <span style={{ fontWeight: 700 }}>Continue with Google</span>
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                margin: "0.25rem 0",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background: "rgba(255,255,255,0.1)",
                }}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                or sign in with email
              </span>
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background: "rgba(255,255,255,0.1)",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  color: "var(--color-text-muted)",
                  marginBottom: "0.5rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Email
              </label>
              <input
                className="input-base"
                type="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                id="login-email"
                name="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  color: "var(--color-text-muted)",
                  marginBottom: "0.5rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Password
              </label>
              <input
                className="input-base"
                type="password"
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                id="login-password"
                name="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </div>

            {errMessage && (
              <div
                style={{
                  padding: "0.65rem 1rem",
                  background: "var(--color-surface-2)",
                  border: "2px solid var(--color-accent-red)",
                  borderRadius: "4px",
                  color: "var(--color-accent-red)",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  boxShadow: "3px 3px 0px var(--color-accent-red)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 8v4m0 4h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                {errMessage}
              </div>
            )}

            <button
              className="btn-primary"
              style={{
                width: "100%",
                padding: "0.8rem",
                fontSize: "0.95rem",
                marginTop: "0.25rem",
              }}
              id="login-submit"
              disabled={loading}
              type="submit"
            >
              {loading ? "Logging in…" : "Log In →"}
            </button>
          </form>

          {/* Divider */}
          <div className="divider" />

          <p
            style={{
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              style={{
                color: "var(--color-accent-blue)",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
