import React from "react";

interface Props {
  children: React.ReactNode;
}

const AppLayout: React.FC<Props> = ({ children }) => {
  return (
    <div className="app-layout">
      <main className="app-layout-main">{children}</main>
    </div>
  );
};

export default AppLayout;
