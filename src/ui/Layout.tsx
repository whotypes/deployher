import type { ReactNode } from "react";

export type LayoutUser = {
  name: string | null;
  email: string;
  image: string | null;
};

export type LayoutProps = {
  title: string;
  children: ReactNode;
  currentPath?: string;
  scripts?: string;
  scriptSrc?: string;
  user?: LayoutUser | null;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/admin", label: "Admin" },
  { href: "/health", label: "Health" }
];

export const Layout = ({ title, children, currentPath = "/dashboard", scripts, scriptSrc, user }: LayoutProps) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <title>{title}</title>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css"
      />
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body>
      <nav className="navbar" role="navigation" aria-label="main navigation">
        <div className="navbar-brand">
          <a className="navbar-item" href="/dashboard" aria-label="Dashboard home">
            <strong style={{ color: "#fff" }}>deployher.com</strong>
          </a>
          <a
            role="button"
            className="navbar-burger"
            aria-label="menu"
            aria-expanded="false"
            data-target="navbarMain"
            tabIndex={0}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </a>
        </div>
        <div id="navbarMain" className="navbar-menu">
          <div className="navbar-start">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`navbar-item ${currentPath === item.href ? "is-active" : ""}`}
                aria-label={item.label}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="navbar-end">
            {user ? (
              <>
                <a href="/account" className="navbar-item" style={{ color: "#888", fontSize: "0.875rem" }} aria-label="Account">
                  {user.image ? (
                    <img src={user.image} alt="" width={24} height={24} style={{ borderRadius: 4, marginRight: 8, verticalAlign: "middle" }} />
                  ) : null}
                  {user.name ?? user.email}
                </a>
                <form id="signout-form" method="post" action="/api/auth/sign-out" className="navbar-item" style={{ padding: 0 }}>
                  <button type="submit" className="button is-ghost" style={{ color: "#888", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.875rem" }} aria-label="Sign out">
                    Sign out
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      <main className="section">
        <div className="container">{children}</div>
      </main>

      <footer className="footer">
        <div className="content has-text-centered">
          <p>deployher.com - Self-hosted PaaS</p>
        </div>
      </footer>

      <script src="/assets/layout.js" type="module" />
      {scriptSrc ? <script src={scriptSrc} type="module" /> : null}
      {scripts ? <script>{scripts}</script> : null}
    </body>
  </html>
);
