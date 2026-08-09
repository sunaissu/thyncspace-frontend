import {
  CaretDownIcon,
  GearIcon,
  NotebookIcon,
  NotepadIcon,
  SignOutIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import React from "react";
import { User } from "../model/user";

interface Props {
  loggedInUser: User | null;
  onLogout: () => void;
}

const Navbar: React.FC<Props> = ({ loggedInUser, onLogout }) => {
  const initial = loggedInUser?.username?.charAt(0).toUpperCase() || "?";

  return (
    <nav className="top-navbar" aria-label="Top navigation">
      <div className="top-navbar-inner">
        <Link
          href={loggedInUser ? "/notes" : "/"}
          className="brand-link"
          aria-label="ThyncSpace home"
        >
          <span className="brand-mark">
            <NotebookIcon weight="bold" size={16} />
          </span>
          <span className="brand-name">
            Thync<span>Space</span>
          </span>
        </Link>

        {loggedInUser?.username ? (
          <details className="account-menu">
            <summary aria-label="Open account menu">
              <span className="account-avatar">{initial}</span>
              <span className="account-name">{loggedInUser.username}</span>
              <CaretDownIcon weight="bold" size={14} />
            </summary>
            <div className="account-menu-popover">
              <div className="account-menu-identity">
                <strong>{loggedInUser.username}</strong>
                <span>{loggedInUser.email}</span>
              </div>
              <Link href="/notes">
                <NotepadIcon size={17} weight="bold" /> Notes
              </Link>
              <Link href="/shared">
                <UsersIcon size={17} weight="bold" /> Shared
              </Link>
              <Link href="/settings">
                <GearIcon size={17} weight="bold" /> Settings
              </Link>
              <button type="button" onClick={onLogout}>
                <SignOutIcon weight="bold" size={17} /> Log out
              </button>
            </div>
          </details>
        ) : (
          <div className="guest-nav-actions">
            <Link href="/login" className="btn-ghost">
              Log in
            </Link>
            <Link href="/register" className="btn-primary">
              Register
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
