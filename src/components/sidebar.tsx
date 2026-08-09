import {
  GearIcon,
  NotepadIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { ReactNode } from "react";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const primaryItems: NavItem[] = [
  {
    label: "My notes",
    path: "/notes",
    icon: <NotepadIcon weight="bold" />,
  },
  {
    label: "Shared with me",
    path: "/shared",
    icon: <UsersIcon weight="bold" />,
  },
];

const settingsItem: NavItem = {
  label: "Settings",
  path: "/settings",
  icon: <GearIcon weight="bold" />,
};

const Sidebar: React.FC = () => {
  const router = useRouter();

  const renderNavItem = (item: NavItem) => {
    const isActive =
      router.pathname.startsWith(item.path) ||
      (item.path === "/notes" && router.pathname === "/dashboard");

    return (
      <Link
        key={item.path}
        href={item.path}
        className={isActive ? "app-rail-link is-active" : "app-rail-link"}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="app-rail-icon" aria-hidden="true">{item.icon}</span>
        <span className="app-rail-tooltip" role="tooltip">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="app-rail" aria-label="Application navigation">
      <nav className="app-rail-primary" aria-label="Workspace">
        {primaryItems.map(renderNavItem)}
      </nav>
      <nav className="app-rail-secondary" aria-label="Preferences">
        {renderNavItem(settingsItem)}
      </nav>
    </aside>
  );
};

export default Sidebar;
