import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { User } from "../model/user";

interface HomeProps {
  loggedInUser: User | null;
}

export default function Home({ loggedInUser }: HomeProps) {
  return (
    <div>
      <Head>
        <title>ThyncSpace | Think. Create. Save.</title>
        <meta
          name="description"
          content="A modern notes application to capture your thoughts, ideas, and everything in between."
        />
      </Head>

      {/* ── Hero ── */}
      <section
        style={{
          position: "relative",
          minHeight: "90vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-bg)",
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
            opacity: 0.15,
            zIndex: 0,
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: "800px",
            margin: "0 auto",
            padding: "0 2rem",
            textAlign: "center",
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 1rem",
              background: "var(--color-surface)",
              border: "2px solid var(--color-border)",
              boxShadow: "4px 4px 0px rgba(0,0,0,0.5)",
              fontSize: "0.8rem",
              fontWeight: 800,
              color: "var(--color-text)",
              marginBottom: "2rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                background: "var(--color-accent-blue)",
                display: "block",
              }}
            />
            YOUR SECOND BRAIN
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: "clamp(3.5rem, 8vw, 6.5rem)",
              fontWeight: 900,
              lineHeight: 1.05,
              marginBottom: "1.5rem",
              letterSpacing: "-0.03em",
            }}
          >
            <span style={{ color: "var(--color-text)" }}>Think.</span>{" "}
            <span style={{ color: "var(--color-accent-blue)" }}>Create.</span>
            <br />
            <span style={{ color: "var(--color-text)" }}>Save.</span>
          </h1>

          {/* Subheading */}
          <p
            style={{
              fontSize: "1.25rem",
              color: "var(--color-text-muted)",
              maxWidth: "560px",
              margin: "0 auto 3rem",
              lineHeight: 1.6,
              fontWeight: 500,
            }}
          >
            A bold, beautifully simple notes app built to capture your thoughts
            the moment they spark. Fast, organized, and always with you.
          </p>

          {/* CTA buttons */}
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {loggedInUser ? (
              <Link href="/notes" style={{ textDecoration: "none" }}>
                <button
                  className="btn-primary"
                  style={{ padding: "1rem 2.5rem", fontSize: "1.1rem" }}
                >
                  Go to your Notes &rarr;
                </button>
              </Link>
            ) : (
              <>
                <Link href="/login" style={{ textDecoration: "none" }}>
                  <button
                    className="btn-primary"
                    style={{ padding: "1rem 2.5rem", fontSize: "1.1rem" }}
                  >
                    Get Started &rarr;
                  </button>
                </Link>
                <Link href="/register" style={{ textDecoration: "none" }}>
                  <button
                    className="btn-ghost"
                    style={{
                      padding: "1rem 2.5rem",
                      fontSize: "1.1rem",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  >
                    Create Account
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── About / Features ── */}
      <section
        style={{ maxWidth: "1100px", margin: "0 auto", padding: "6rem 2rem" }}
      >
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 800,
              color: "var(--color-accent-blue)",
              letterSpacing: "0.1em",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
            }}
          >
            Features
          </div>
          <h2
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
            }}
          >
            Everything you need, nothing you do not
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "2rem",
          }}
        >
          {[
            {
              icon: "✏️",
              title: "Quick Capture",
              desc: "Jot down ideas the moment they come. No friction, no fuss — just write.",
              color: "var(--color-accent-blue)",
            },
            {
              icon: "🗂️",
              title: "Organized Grid",
              desc: "Your notes presented in a clean, scannable grid so nothing gets lost.",
              color: "var(--color-accent-blue)",
            },
            {
              icon: "🔐",
              title: "Secure Access",
              desc: "Each note belongs to your account. Login protected and always private.",
              color: "var(--color-accent-blue)",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              style={{
                padding: "2.5rem",
                background: "var(--color-surface)",
                border: `2px solid var(--color-border)`,
                borderTop: `6px solid ${feature.color}`,
                boxShadow: "6px 6px 0px rgba(0,0,0,0.4)",
                transition: "transform 0.1s ease",
              }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: "1.5rem" }}>
                {feature.icon}
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.25rem",
                  color: "var(--color-text)",
                  marginBottom: "0.75rem",
                }}
              >
                {feature.title}
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  color: "var(--color-text-muted)",
                  lineHeight: 1.6,
                }}
              >
                {feature.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: "2px solid var(--color-border)",
          padding: "3rem 2rem",
          textAlign: "center",
          background: "var(--color-surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Image
            src="/icons/icon.svg"
            alt=""
            width={24}
            height={24}
            aria-hidden="true"
          />
          <span
            style={{
              fontWeight: 900,
              color: "var(--color-text)",
              fontSize: "1.1rem",
              letterSpacing: "-0.02em",
            }}
          >
            ThyncSpace
          </span>
        </div>
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "0.9rem",
            fontWeight: 500,
          }}
        >
          Personal Project by{" "}
          <span style={{ color: "var(--color-text)", fontWeight: 800 }}>
            Brett Josef C. Galvez
          </span>
        </p>
        <p
          style={{
            color: "var(--color-border)",
            fontSize: "0.8rem",
            marginTop: "1rem",
            fontWeight: 700,
          }}
        >
          © 2023 · ALL RIGHTS RESERVED
        </p>
      </footer>
    </div>
  );
}
