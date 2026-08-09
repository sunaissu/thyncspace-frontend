import Head from "next/head";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import AppLayout from "../components/appLayout";
import {
  MagnifyingGlassIcon,
  HandshakeIcon,
} from "@phosphor-icons/react";
import { Note, noteMatchesSearch } from "../model/note";
import { User } from "../model/user";
import NoteCard from "../components/note";
import * as NotesApi from "../util/fetch";

interface SharedPageProps {
  loggedInUser: User | null;
}

const SharedNotes: React.FC<SharedPageProps> = ({ loggedInUser }) => {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadShared() {
      try {
        setError("");
        const fetched = await NotesApi.fetchSharedNotes();
        setNotes(fetched);
      } catch (error) {
        console.error(error);
        setError(error instanceof Error ? error.message : "Could not load shared notes.");
      } finally {
        setLoading(false);
      }
    }
    loadShared();
  }, []);

  const handleToggleFavorite = async (noteId: string) => {
    try {
      setError("");
      const updated = await NotesApi.toggleFavoriteNote(noteId);
      setNotes((prev) =>
        prev.map((n) =>
          n._id === noteId ? { ...n, favoritedBy: updated.favoritedBy } : n,
        ),
      );
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Could not update favorite.");
    }
  };

  const filteredNotes = notes.filter((n) => noteMatchesSearch(n, search));

  return (
    <AppLayout>
      <div>
        <Head>
          <title>Shared Notes | ThyncSpace</title>
        </Head>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.85rem",
                fontWeight: 800,
                color: "var(--color-accent-red)",
                letterSpacing: "0.1em",
                marginBottom: "0.4rem",
                textTransform: "uppercase",
              }}
            >
              SHARED
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "var(--color-text)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Shared With Me
            </h1>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
                marginTop: "0.35rem",
                fontWeight: 500,
              }}
            >
              {filteredNotes.length} shared{" "}
              {filteredNotes.length === 1 ? "note" : "notes"}
            </p>
          </div>

          {/* Search */}
          <div style={{ position: "relative", minWidth: "260px" }}>
            <MagnifyingGlassIcon
              size={16}
              weight="bold"
              style={{
                position: "absolute",
                left: "0.9rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
              }}
            />
            <input
              className="input-base"
              style={{ padding: "0.4rem 0.4rem 0.4rem 2.25rem" }}
              placeholder="Search shared notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="new-note-dialog-error" role="alert">{error}</p>}

        {/* Content */}
        {loading ? (
          <div
            style={{
              color: "var(--color-text-muted)",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            Loading…
          </div>
        ) : filteredNotes.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40vh",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                background: "var(--color-surface)",
                border: "2px solid var(--color-border)",
                borderRadius: "4px",
                boxShadow: "4px 4px 0px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderTop: "6px solid var(--color-accent-red)",
              }}
            >
              <HandshakeIcon
                size={32}
                weight="bold"
                color="var(--color-text)"
              />
            </div>
            <div
              style={{
                color: "var(--color-text)",
                fontSize: "1.1rem",
                fontWeight: 700,
              }}
            >
              No shared notes yet.
            </div>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Notes shared with you will appear here.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {filteredNotes.map((note) => {
              return (
                <div key={note._id}>
                  <NoteCard
                    note={note}
                    loggedInUserId={loggedInUser?._id}
                    onOpen={(noteId) =>
                      router.push({ pathname: "/notes", query: { noteId } })
                    }
                    onToggleFavorite={handleToggleFavorite}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default SharedNotes;
