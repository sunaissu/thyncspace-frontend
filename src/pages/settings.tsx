import {
  CheckIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Head from "next/head";
import React, { FormEvent, useEffect, useState } from "react";
import AppLayout from "../components/appLayout";
import {
  ACCENT_BRAND_COLORS,
  AccentTheme,
  ThemePreference,
  useTheme,
} from "../context/themeContext";
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

const accentOptions: Array<{
  value: AccentTheme;
  label: string;
  description: string;
}> = [
  {
    value: "blue",
    label: "Blue",
    description: "The default ThyncSpace accent.",
  },
  {
    value: "violet",
    label: "Violet",
    description: "A calm, expressive accent.",
  },
  {
    value: "emerald",
    label: "Emerald",
    description: "A focused, natural accent.",
  },
  {
    value: "amber",
    label: "Amber",
    description: "A warm, energetic accent.",
  },
  {
    value: "rose",
    label: "Rose",
    description: "A bright, confident accent.",
  },
];

interface SettingsProps {
  loggedInUser?: User | null;
  onUserUpdate?: (user: User) => void;
}

const Settings: React.FC<SettingsProps> = ({ loggedInUser, onUserUpdate }) => {
  const {
    preference,
    resolvedTheme,
    accentTheme,
    setPreference,
    setAccentTheme,
  } = useTheme();
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

        <section className="settings-section" aria-labelledby="accent-heading">
          <div className="settings-section-heading">
            <div>
              <h2 id="accent-heading">Accent theme</h2>
              <p>
                Blue is the default. Choose the color that feels right on this
                device.
              </p>
            </div>
            <span className="resolved-theme-label">{accentTheme}</span>
          </div>

          <div
            className="accent-option-grid"
            role="group"
            aria-label="Accent theme"
          >
            {accentOptions.map(({ value, label, description }) => {
              const selected = accentTheme === value;
              return (
                <button
                  type="button"
                  key={value}
                  className={selected ? "accent-option is-selected" : "accent-option"}
                  onClick={() => setAccentTheme(value)}
                  aria-pressed={selected}
                >
                  <span
                    className="accent-swatch"
                    style={{
                      backgroundColor:
                        ACCENT_BRAND_COLORS[value][resolvedTheme].primary,
                    }}
                    aria-hidden="true"
                  />
                  <span className="accent-option-copy">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  {selected && <CheckIcon size={17} weight="bold" />}
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
          <form onSubmit={saveProfile} className="settings-profile-form">
            <label className="settings-field" htmlFor="settings-username">
              <span className="settings-field-label">Username</span>
              <input
                id="settings-username"
                name="username"
                className="input-base"
                minLength={2}
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={savingProfile}
                autoComplete="username"
              />
            </label>
            <label className="settings-field" htmlFor="settings-email">
              <span className="settings-field-label">
                Email
                <span className="settings-readonly-badge">Read only</span>
              </span>
              <input
                id="settings-email"
                name="email"
                type="email"
                className="input-base settings-readonly-input"
                value={loggedInUser?.email ?? ""}
                readOnly
                aria-readonly="true"
                aria-describedby="email-readonly-help"
                autoComplete="email"
              />
              <small id="email-readonly-help" className="settings-readonly-help">
                This email is linked to your account and cannot be changed here.
              </small>
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
            {profileStatus && (
              <p className="settings-profile-status" role="status">
                {profileStatus}
              </p>
            )}
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
