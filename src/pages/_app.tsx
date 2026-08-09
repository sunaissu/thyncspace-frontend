import "@/styles/globals.css";
import "@sunaissu/document-editor/styles.css";
import "@sunaissu/calculator/styles.css";
import type { AppProps } from "next/app";
import Navbar from "../components/navbar";
import React, { useCallback, useEffect } from "react";
import { User } from "../model/user";
import * as NotesApi from "../util/fetch";
import { SpinnerBallIcon } from "@phosphor-icons/react";
import { useRouter } from "next/router";
import { ThemeProvider } from "../context/themeContext";
import { useServiceWorker } from "../hooks/useServiceWorker";

const PROTECTED_ROUTES = ["/notes", "/shared", "/favorites", "/settings"];
const AUTHENTICATED_REDIRECT_ROUTES = ["/", "/login", "/register"];

export default function App({ Component, pageProps }: AppProps) {
  useServiceWorker();
  const router = useRouter();
  const [loggedInUser, setLoggedInUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [authError, setAuthError] = React.useState("");

  const fetchLoggedInUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setAuthError("");
      const user = await NotesApi.getLoginUser();
      setLoggedInUser(user);
    } catch (error) {
      if (NotesApi.isUnauthorizedError(error)) {
        setLoggedInUser(null);
      } else {
        setAuthError(
          error instanceof Error
            ? error.message
            : "The authentication service is unavailable.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLoggedInUser();
  }, [fetchLoggedInUser]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (loggedInUser && AUTHENTICATED_REDIRECT_ROUTES.includes(router.pathname)) {
      void router.replace("/notes");
      return;
    }

    if (!loggedInUser && PROTECTED_ROUTES.includes(router.pathname)) {
      void router.replace("/unauthorized");
    }
  }, [loggedInUser, router, router.pathname, isLoading]);

  const isRedirecting =
    !isLoading &&
    ((Boolean(loggedInUser) &&
      AUTHENTICATED_REDIRECT_ROUTES.includes(router.pathname)) ||
      (!loggedInUser && PROTECTED_ROUTES.includes(router.pathname)));

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await NotesApi.logout();
      setLoggedInUser(null);
      await router.replace("/login");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not log out safely.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (authError) {
    return (
      <ThemeProvider>
        <main
          style={{
            alignItems: "center",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1>ThyncSpace cannot verify your session</h1>
          <p>{authError}</p>
          <button className="btn-primary" type="button" onClick={fetchLoggedInUser}>
            Retry securely
          </button>
        </main>
      </ThemeProvider>
    );
  }

  if (isLoading || isRedirecting) {
    return (
      <ThemeProvider>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            background: "var(--color-bg)",
            color: "var(--color-text-muted)",
          }}
        >
          <SpinnerBallIcon className="spin" size={48} />
        </div>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider>
      <div>
        <Navbar loggedInUser={loggedInUser} onLogout={handleLogout} />
        <Component
          {...pageProps}
          loggedInUser={loggedInUser}
          onUserUpdate={setLoggedInUser}
        />
      </div>
    </ThemeProvider>
  );
}
