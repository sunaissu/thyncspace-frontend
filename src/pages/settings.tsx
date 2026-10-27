import DeviceSessions from "../components/deviceSessions";
import StorageUsagePanel from "../components/storageUsage";
import { useEditorPreferences } from "../hooks/useEditorPreferences";
import {
  CheckIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
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
import type { ColorScheme, ScrollbarPreference } from "../util/appearance";

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
    colorScheme,
    setColorScheme,
    customBrandColors,
    setCustomBrandColors,
    scrollbarPreference,
    setScrollbarPreference,
    appearanceStorageError,
  } = useTheme();
  const editor = useEditorPreferences(loggedInUser?._id);
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
              <h2 id="accent-heading">Color scheme</h2>
              <p>
                Choose a preset or your own colors. Default keeps your existing accent theme.
              </p>
            </div>
            <span className="resolved-theme-label">{colorScheme === "default" ? accentTheme : colorScheme}</span>
          </div>

          <div className="appearance-fields">
            <label className="settings-field" htmlFor="settings-color-scheme">
              <span className="settings-field-label">Color scheme</span>
              <select id="settings-color-scheme" value={colorScheme} onChange={event => setColorScheme(event.target.value as ColorScheme)}>
                <option value="default">Default</option>
                <option value="ocean">Ocean</option>
                <option value="forest">Forest</option>
                <option value="plum">Plum</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {colorScheme === "custom" && (
              <>
                <label className="settings-field appearance-color" htmlFor="settings-primary-color">
                  <span className="settings-field-label">Primary color</span>
                  <input id="settings-primary-color" type="color" value={customBrandColors.primary} onChange={event => setCustomBrandColors({ primary: event.target.value })} />
                </label>
                <label className="settings-field appearance-color" htmlFor="settings-secondary-color">
                  <span className="settings-field-label">Secondary color</span>
                  <input id="settings-secondary-color" type="color" value={customBrandColors.secondary} onChange={event => setCustomBrandColors({ secondary: event.target.value })} />
                </label>
              </>
            )}
          </div>
          {colorScheme === "default" && (
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
          )}
        </section>

        <section className="settings-section" aria-labelledby="scrollbar-heading">
          <div className="settings-section-heading">
            <div>
              <h2 id="scrollbar-heading">Scrollbars</h2>
              <p>Use browser colors, choose your own, or hide the bars while keeping scrolling enabled.</p>
            </div>
          </div>
          <div className="appearance-fields">
            <label className="settings-field" htmlFor="settings-scrollbar-mode">
              <span className="settings-field-label">Scrollbar appearance</span>
              <select id="settings-scrollbar-mode" value={scrollbarPreference.mode} onChange={event => setScrollbarPreference({ mode: event.target.value as ScrollbarPreference["mode"] })}>
                <option value="native">Native</option>
                <option value="custom">Custom colors</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            {scrollbarPreference.mode === "custom" && (
              <>
                <label className="settings-field appearance-color" htmlFor="settings-scrollbar-thumb">
                  <span className="settings-field-label">Thumb color</span>
                  <input id="settings-scrollbar-thumb" type="color" value={scrollbarPreference.thumbColor} onChange={event => setScrollbarPreference({ thumbColor: event.target.value })} />
                </label>
                <label className="settings-field appearance-color" htmlFor="settings-scrollbar-track">
                  <span className="settings-field-label">Track color</span>
                  <input id="settings-scrollbar-track" type="color" value={scrollbarPreference.trackColor} disabled={scrollbarPreference.transparentTrack} onChange={event => setScrollbarPreference({ trackColor: event.target.value })} />
                </label>
                <label className="appearance-checkbox">
                  <input type="checkbox" checked={scrollbarPreference.transparentTrack} onChange={event => setScrollbarPreference({ transparentTrack: event.target.checked })} />
                  Transparent track
                </label>
              </>
            )}
            {scrollbarPreference.mode !== "hidden" && (
              <label className="appearance-checkbox">
                <input type="checkbox" checked={scrollbarPreference.thin} onChange={event => setScrollbarPreference({ thin: event.target.checked })} />
                Thin scrollbars
              </label>
            )}
          </div>
          <div className="appearance-scrollbar-preview" role="region" aria-label="Scrollbar preview" tabIndex={0}>
            <p>Scroll here to try your settings.</p>
            <p>Your notes keep their content and formatting.</p>
            <p>These appearance settings apply on this device.</p>
            <p>Use your mouse, touchpad, or arrow keys to scroll.</p>
            <p>Hidden scrollbars still allow scrolling.</p>
          </div>
          {appearanceStorageError && <p role="status">{appearanceStorageError}</p>}
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

        <section className="settings-section"><h2>Account privacy</h2><p>Download your account data and manage deletion requests.</p><Link className="btn-ghost" href="/privacy/">Manage account privacy</Link></section>
        <section className="settings-section"><h2>Account security</h2><p>Verify your email and manage your password.</p><Link className="btn-ghost" href="/security/">Manage account security</Link></section>
        <DeviceSessions />
        <StorageUsagePanel />
        <section className="settings-section settings-note">
          <h2>Editor defaults</h2>
          <p>Defaults for new editor sessions on this device. Shared content is unchanged.</p>
          <div className="editor-preferences-form">
            <label>Preferred editor mode<select value={editor.preferences.mode} onChange={event => editor.update({ mode: event.target.value as typeof editor.preferences.mode })}><option value="visual">Visual</option><option value="markdown">Markdown</option><option value="split">Split</option><option value="preview">Preview</option></select></label>
            <label>Editor font size<input type="number" min={12} max={28} value={editor.preferences.fontSize} onChange={event => editor.update({ fontSize: Number(event.target.value) })} /></label>
            <label>Line width<select value={editor.preferences.lineWidth} onChange={event => editor.update({ lineWidth: event.target.value as "full" | "reading" })}><option value="full">Full width</option><option value="reading">Reading width</option></select></label>
            <label>Default new note type<select value={editor.preferences.noteType} onChange={event => editor.update({ noteType: event.target.value as "document" | "whiteboard" | "documentation" })}><option value="document">Document</option><option value="whiteboard">Whiteboard</option><option value="documentation">Documentation</option></select></label>
          </div>
          {editor.error && <p role="alert">{editor.error}</p>}
        </section>
      </div>
    </AppLayout>
  );
};

export default Settings;
