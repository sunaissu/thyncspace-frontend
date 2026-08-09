import Head from "next/head";
import Link from "next/link";
import React from "react";
import { ProhibitIcon } from "@phosphor-icons/react";

const Unauthorized: React.FC = () => {
  return (
    <div>
      <Head>
        <title>Unauthorized | ThyncSpace</title>
      </Head>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 64px)",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            fontSize: "4rem",
            marginBottom: "1rem",
            background: "var(--color-surface)",
            border: "2px solid var(--color-border)",
            borderRadius: "16px",
            padding: "2rem",
            boxShadow: "8px 8px 0px rgba(0,0,0,0.5)",
            borderTop: "6px solid var(--color-accent-red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ProhibitIcon
            size={64}
            weight="bold"
            color="var(--color-accent-red)"
          />
        </div>
        <h1
          style={{
            fontSize: "3rem",
            fontWeight: 900,
            marginBottom: "1rem",
            letterSpacing: "-0.02em",
          }}
        >
          Access Denied
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--color-text-muted)",
            marginBottom: "2rem",
            maxWidth: "400px",
          }}
        >
          You need to be logged in to access this page. Please log in or create
          an account.
        </p>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Link href="/login" style={{ textDecoration: "none" }}>
            <button
              className="btn-primary"
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              Log In
            </button>
          </Link>
          <Link href="/" style={{ textDecoration: "none" }}>
            <button
              className="btn-ghost"
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
