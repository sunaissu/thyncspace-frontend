import {
  CheckIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Head from "next/head";
import React, { FormEvent, useEffect, useState } from "react";
import AppLayout from "../components/appLayout";
import { ThemePreference, useTheme } from "../context/themeContext";
import type { User } from "../model/user";
import * as NotesApi from "../util/fetch";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    value: "system",
    label: "Automatic",
    description: "Follow your device appearance and update automatically.",
    icon: DesktopIcon,
  },
  {
    value: "light",
    label: "Light",
    description: "Use a bright, paper-like workspace.",
    icon: SunIcon,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use a low-glare workspace for dim environments.",
    icon: MoonIcon,
  },
];

interface SettingsProps {
  loggedInUser?: User | null;
  onUserUpdate?: (user: User) => void;
}

const Settings: React.FC<SettingsProps> = ({ loggedInUser, onUserUpdate }) => {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [username, setUsername] = useState(loggedInUser?.username ?? "");
  const [profileStatus, setProfileStatus] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setUsername(loggedInUser?.username ?? "");
  }, [loggedInUser?.username]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || savingProfile) return;
    setSavingProfile(true);
    setProfileStatus("");
    try {
      const user = await NotesApi.updateUsername(username);
      onUserUpdate?.(user);
      setUsername(user.username);
      setProfileStatus("Profile updated.");
    } catch (error) {
      setProfileStatus(
        error instanceof Error ? error.message : "Could not update profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <AppLayout>
      <Head>
        <title>Settings | ThyncSpace</title>
      </Head>

      <div className="settings-page">
        <header className="settings-header">
          <span className="eyebrow">Workspace settings</span>
          <h1>Preferences</h1>
          <p>Make ThyncSpace comfortable on this device.</p>
        </header>

        <section className="settings-section" aria-labelledby="appearance-heading">
          <div className="settings-section-heading">
            <div>
              <h2 id="appearance-heading">Appearance</h2>
              <p>Choose how your notes, navigation, and tools look.</p>
            </div>
            <span className="resolved-theme-label">Currently {resolvedTheme}</span>
          </div>

          <div className="theme-option-grid">
            {themeOptions.map(({ value, label, description, icon: Icon }) => {
              const selected = preference === value;
              return (
                <button
                  type="button"
                  key={value}
                  className={selected ? "theme-option is-selected" : "theme-option"}
                  onClick={() => setPreference(value)}
                  aria-pressed={selected}
                >
                  <span className={`theme-preview theme-preview-${value}`}>
                    <span className="theme-preview-rail" />
                    <span className="theme-preview-page">
                      <span />
                      <span />
                      <span />
                    </span>
                  </span>
                  <span className="theme-option-copy">
                    <span className="theme-option-title">
                      <Icon size={18} weight="bold" />
                      <strong>{label}</strong>
                      {selected && <CheckIcon size={17} weight="bold" />}
                    </span>
                    <span>{description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="profile-heading">
          <div className="settings-section-heading">
            <div>
              <h2 id="profile-heading">Profile</h2>
              <p>Update the name collaborators see when you share and edit notes.</p>
            </div>
          </div>
          <form onSubmit={saveProfile} style={{ display: "grid", gap: "1rem", maxWidth: 520 }}>
            <label>
              <span>Username</span>
              <input
                className="input-base"
                minLength={2}
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={savingProfile}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                className="input-base"
                value={loggedInUser?.email ?? ""}
                disabled
                aria-describedby="email-readonly-help"
              />
              <small id="email-readonly-help">Email changes are not enabled yet.</small>
            </label>
            <div>
              <button
                className="new-note-button"
                type="submit"
                disabled={
                  savingProfile ||
                  !username.trim() ||
                  username.trim() === loggedInUser?.username
                }
              >
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
            </div>
            {profileStatus && <p role="status">{profileStatus}</p>}
          </form>
        </section>

        <section className="settings-section settings-note">
          <h2>Editor defaults</h2>
          <p>
            Notes now open in the visual editor. Markdown source and preview remain
            available from every document toolbar.
          </p>
        </section>
      </div>
    </AppLayout>
  );
};

export default Settings;
