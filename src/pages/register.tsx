import Head from "next/head";
import Link from "next/link";
import React from "react";
import * as NotesApi from "../util/fetch";
import env from "@/util/config";

const SignUp: React.FC = () => {
  const [username, setUsername] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [password, setPassword] = React.useState<string>("");
  const [checkPassword, setCheckPassword] = React.useState<string>("");
  const [errMessage, setErrMessage] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);

  const registerClicked = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrMessage("");
    const normalizedUsername = username.trim().replace(/\s+/g, " ");
    const normalizedEmail = email.trim();

    if (!normalizedUsername || !password || !normalizedEmail || !checkPassword) {
      setErrMessage("All fields are required");
      return;
    }
    if (normalizedUsername.length < 2 || normalizedUsername.length > 50) {
      setErrMessage("Username must be between 2 and 50 characters");
      return;
    }
    if (password.length < 12) {
      setErrMessage("Password must be at least 12 characters");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setErrMessage("Password is too long");
      return;
    }
    if (password !== checkPassword) {
      setErrMessage("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await NotesApi.registerUser({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
      });
      window.location.replace("/notes");
    } catch (error) {
      setErrMessage(
        error instanceof Error ? error.message : "Registration failed",
      );
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
        <title>ThyncSpace | Create Account</title>
        <meta
          name="description"
          content="Register for a new ThyncSpace account."
        />
      </Head>

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
            maxWidth: "440px",
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
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
              Create account
            </h1>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Join ThyncSpace and start capturing ideas
            </p>
          </div>

          {/* Form */}
          <form
            style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}
            onSubmit={registerClicked}
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
                or sign up with email
              </span>
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background: "rgba(255,255,255,0.1)",
                }}
              />
            </div>
            {[
              {
                label: "Username",
                type: "text",
                placeholder: "johndoe",
                setter: setUsername,
                id: "reg-username",
              },
              {
                label: "Email",
                type: "email",
                placeholder: "you@example.com",
                setter: setEmail,
                id: "reg-email",
              },
              {
                label: "Password",
                type: "password",
                placeholder: "••••••••",
                setter: setPassword,
                id: "reg-password",
              },
              {
                label: "Confirm Password",
                type: "password",
                placeholder: "••••••••",
                setter: setCheckPassword,
                id: "reg-confirm",
              },
            ].map((field) => (
              <div key={field.label}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "var(--color-text-muted)",
                    marginBottom: "0.45rem",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {field.label}
                </label>
                <input
                  id={field.id}
                  className="input-base"
                  type={field.type}
                  placeholder={field.placeholder}
                  onChange={(e) => field.setter(e.target.value)}
                  name={field.id}
                  autoComplete={
                    field.id === "reg-email"
                      ? "email"
                      : field.id === "reg-username"
                        ? "username"
                        : "new-password"
                  }
                  minLength={
                    field.id === "reg-username"
                      ? 2
                      : field.type === "password"
                        ? 12
                        : undefined
                  }
                  maxLength={
                    field.id === "reg-email"
                      ? 254
                      : field.id === "reg-username"
                        ? 50
                        : 128
                  }
                  required
                />
              </div>
            ))}

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
              id="register-submit"
              disabled={loading}
              type="submit"
            >
              {loading ? "Creating account…" : "Create Account →"}
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
            Already have an account?{" "}
            <Link
              href="/login"
              style={{
                color: "var(--color-accent-blue)",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
