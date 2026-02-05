import type { ReactNode } from "react";

export type LayoutProps = {
  title: string;
  children: ReactNode;
  currentPath?: string;
  scripts?: string;
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/files", label: "Files" },
  { href: "/health", label: "Health" }
];

export const Layout = ({ title, children, currentPath = "/", scripts }: LayoutProps) => (
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
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              color-scheme: dark;
            }
            body {
              background-color: #000;
              color: #ededed;
              min-height: 100vh;
            }
            .navbar {
              background-color: #000;
              border-bottom: 1px solid #333;
            }
            .navbar-item, .navbar-link {
              color: #888 !important;
            }
            .navbar-item:hover, .navbar-link:hover {
              background-color: #111 !important;
              color: #fff !important;
            }
            .navbar-item.is-active {
              background-color: transparent !important;
              color: #fff !important;
            }
            .box {
              background-color: #111;
              border: 1px solid #333;
              border-radius: 8px;
              box-shadow: none;
              color: #ededed;
            }
            .card {
              background-color: #111;
              border: 1px solid #333;
              box-shadow: none;
            }
            .card-header {
              background-color: #111;
              border-bottom: 1px solid #333;
              box-shadow: none;
            }
            .card-header-title {
              color: #ededed;
            }
            .card-content {
              color: #ededed;
            }
            .table {
              background-color: transparent;
              color: #ededed;
            }
            .table th {
              color: #888 !important;
              border-color: #333 !important;
              font-weight: 400;
            }
            .table td {
              border-color: #333;
              color: #ededed;
            }
            .table thead th {
              border-color: #333;
            }
            .table tbody tr:hover {
              background-color: #1a1a1a;
            }
            .table.is-hoverable tbody tr:not(.is-selected):hover {
              background-color: #1a1a1a;
            }
            .title, .subtitle {
              color: #ededed !important;
            }
            .label {
              color: #888;
              font-weight: 400;
            }
            .input, .textarea, .select select {
              background-color: #000;
              border: 1px solid #333;
              color: #ededed;
              border-radius: 6px;
            }
            .input:focus, .textarea:focus, .select select:focus {
              border-color: #fff;
              box-shadow: none;
            }
            .input::placeholder {
              color: #666;
            }
            .notification {
              background-color: #111;
              border: 1px solid #333;
              color: #ededed;
            }
            .message {
              background-color: #111;
            }
            .message-body {
              background-color: #111;
              border: 1px solid #333;
              color: #ededed;
            }
            .footer {
              background-color: #000;
              border-top: 1px solid #333;
              color: #666;
              padding: 1.5rem;
            }
            pre.log-output {
              background-color: #0a0a0a;
              color: #ededed;
              padding: 1rem;
              border: 1px solid #333;
              border-radius: 6px;
              overflow-x: auto;
              font-family: 'Geist Mono', 'SF Mono', 'Consolas', 'Liberation Mono', monospace;
              font-size: 0.8125rem;
              line-height: 1.6;
              max-height: 500px;
              overflow-y: auto;
            }
            .tag {
              font-weight: 500;
              font-size: 0.75rem;
            }
            .tag.is-success {
              background-color: #0a0;
              color: #fff;
            }
            .tag.is-danger {
              background-color: #d00;
              color: #fff;
            }
            .tag.is-warning {
              background-color: #f5a623;
              color: #000;
            }
            .tag.is-info {
              background-color: #0070f3;
              color: #fff;
            }
            .tag.is-light {
              background-color: #333;
              color: #888;
            }
            a {
              color: #0070f3;
            }
            a:hover {
              color: #3291ff;
            }
            .breadcrumb a {
              color: #666;
            }
            .breadcrumb li.is-active a {
              color: #ededed;
            }
            .breadcrumb li + li::before {
              color: #444;
            }
            .button {
              border-radius: 6px;
              font-weight: 500;
              border: 1px solid #333;
              transition: all 0.15s ease;
            }
            .button.is-success {
              background-color: #fff;
              color: #000;
              border-color: #fff;
            }
            .button.is-success:hover {
              background-color: #ededed;
              border-color: #ededed;
            }
            .button.is-danger {
              background-color: transparent;
              color: #f00;
              border-color: #333;
            }
            .button.is-danger:hover {
              background-color: #1a0000;
              border-color: #f00;
            }
            .button.is-info {
              background-color: transparent;
              color: #ededed;
              border-color: #333;
            }
            .button.is-info:hover {
              background-color: #111;
              border-color: #ededed;
            }
            .button.is-link {
              background-color: transparent;
              color: #0070f3;
              border-color: #333;
            }
            .button.is-link:hover {
              background-color: #0070f3;
              color: #fff;
              border-color: #0070f3;
            }
            .button.is-primary {
              background-color: #fff;
              color: #000;
              border-color: #fff;
            }
            .button.is-primary:hover {
              background-color: #ededed;
            }
            .notification.is-toast {
              position: fixed;
              top: 1rem;
              right: 1rem;
              z-index: 1000;
              animation: slideIn 0.2s ease-out;
              border-radius: 6px;
            }
            .notification.is-success {
              background-color: #0a0;
              color: #fff;
              border: none;
            }
            .notification.is-danger {
              background-color: #d00;
              color: #fff;
              border: none;
            }
            .notification.is-warning {
              background-color: #f5a623;
              color: #000;
              border: none;
            }
            @keyframes slideIn {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            code {
              background-color: #1a1a1a;
              color: #ededed;
              padding: 0.125rem 0.375rem;
              border-radius: 4px;
              font-size: 0.875rem;
            }
            .heading {
              color: #666;
              font-size: 0.6875rem;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            .help {
              color: #666;
            }
            .section {
              padding: 2rem 1.5rem;
            }
            hr {
              background-color: #333;
            }
            strong {
              color: #ededed;
            }
          `
        }}
      />
    </head>
    <body>
      <nav className="navbar" role="navigation" aria-label="main navigation">
        <div className="navbar-brand">
          <a className="navbar-item" href="/">
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

      {scripts ? (
        <script dangerouslySetInnerHTML={{ __html: scripts }} />
      ) : null}
    </body>
  </html>
);
