import {
  HandshakeIcon,
  MagnifyingGlassIcon,
  SpinnerBallIcon,
  XIcon,
} from "@phosphor-icons/react";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../components/appLayout";
import NoteCard from "../components/note";
import { Note, noteMatchesSearch } from "../model/note";
import { User } from "../model/user";
import * as NotesApi from "../util/fetch";

interface SharedPageProps {
  loggedInUser: User | null;
}

const SharedNotes: React.FC<SharedPageProps> = ({ loggedInUser }) => {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadShared = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setNotes(await NotesApi.fetchSharedNotes());
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load shared notes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShared();
  }, [loadShared]);

  const handleToggleFavorite = async (noteId: string) => {
    try {
      setError("");
      const updated = await NotesApi.toggleFavoriteNote(noteId);
      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          note._id === noteId
            ? { ...note, favoritedBy: updated.favoritedBy }
            : note,
        ),
      );
    } catch (favoriteError) {
      console.error(favoriteError);
      setError(
        favoriteError instanceof Error
          ? favoriteError.message
          : "Could not update favorite.",
      );
    }
  };

  const normalizedSearch = search.trim();
  const filteredNotes = useMemo(
    () => notes.filter((note) => noteMatchesSearch(note, normalizedSearch)),
    [normalizedSearch, notes],
  );
  const hasSearch = normalizedSearch.length > 0;

  return (
    <AppLayout>
      <Head>
        <title>Shared With Me | ThyncSpace</title>
      </Head>

      <div className="shared-page">
        <header className="shared-header">
          <div className="shared-header-copy">
            <span className="shared-header-icon" aria-hidden="true">
              <HandshakeIcon size={25} weight="bold" />
            </span>
            <div>
              <span className="shared-eyebrow">Collaboration</span>
              <h1>Shared with me</h1>
              <p>Notes and boards other people have invited you to work on.</p>
            </div>
          </div>
          <div
            className="shared-summary"
            aria-label={`${notes.length} shared ${notes.length === 1 ? "note" : "notes"}`}
          >
            <strong>{notes.length}</strong>
            <span>{notes.length === 1 ? "shared note" : "shared notes"}</span>
          </div>
        </header>

        <section className="shared-toolbar" aria-label="Shared notes controls">
          <div className="shared-search" role="search">
            <label className="sr-only" htmlFor="shared-notes-search">
              Search shared notes
            </label>
            <MagnifyingGlassIcon size={17} weight="bold" aria-hidden="true" />
            <input
              id="shared-notes-search"
              className="input-base"
              type="search"
              placeholder="Search by title or content"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear shared notes search"
              >
                <XIcon size={15} weight="bold" />
              </button>
            )}
          </div>
          <p className="shared-result-count" aria-live="polite">
            {hasSearch
              ? `${filteredNotes.length} ${filteredNotes.length === 1 ? "match" : "matches"}`
              : "Search everything shared with you"}
          </p>
        </section>

        {error && (
          <div className="shared-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadShared()}>
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="shared-loading" role="status">
            <SpinnerBallIcon className="spin" size={25} />
            <span>Loading shared notes...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="shared-empty">
            <span className="shared-empty-icon" aria-hidden="true">
              {hasSearch ? (
                <MagnifyingGlassIcon size={28} weight="bold" />
              ) : (
                <HandshakeIcon size={28} weight="bold" />
              )}
            </span>
            <h2>{hasSearch ? "No matching notes" : "Nothing shared yet"}</h2>
            <p>
              {hasSearch
                ? "Try another title or clear your search to see every shared note."
                : "When someone shares a note or board with you, it will appear here."}
            </p>
            {hasSearch && (
              <button type="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="shared-grid">
            {filteredNotes.map((note) => {
              const permission = note.sharedWith.find(
                ({ userId }) => userId === loggedInUser?._id,
              )?.permission;
              const canEdit = permission === "editor";

              return (
                <div className="shared-note-entry" key={note._id}>
                  <div className="shared-note-access">
                    <span>Your access</span>
                    <strong className={canEdit ? "is-editor" : "is-viewer"}>
                      {canEdit ? "Can edit" : "View only"}
                    </strong>
                  </div>
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
