import { GearIcon, NotepadIcon, UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import Sidebar from "./sidebar";

interface Props {
  children: React.ReactNode;
}

const AppLayout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const mobileItems = [
    { label: "Notes", path: "/notes", icon: NotepadIcon },
    { label: "Shared", path: "/shared", icon: UsersIcon },
    { label: "Settings", path: "/settings", icon: GearIcon },
  ];

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-layout-main">
        {children}
      </main>
      <nav className="mobile-tab-bar" aria-label="Application navigation">
        {mobileItems.map(({ label, path, icon: Icon }) => {
          const active = router.pathname.startsWith(path);
          return (
            <Link
              key={path}
              href={path}
              className={active ? "mobile-tab is-active" : "mobile-tab"}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} weight={active ? "fill" : "bold"} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default AppLayout;
