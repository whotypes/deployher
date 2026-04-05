from pathlib import Path

out_dir = Path("dist")
out_dir.mkdir(parents=True, exist_ok=True)

html = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>python-deployher-pip</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f8fafc;
        --card: #fff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
        --accent: #0d9488;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #020617;
          --card: #0f172a;
          --text: #f1f5f9;
          --muted: #94a3b8;
          --border: #1e293b;
          --accent: #2dd4bf;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.55;
      }
      header {
        padding: 1.5rem 1.25rem 1rem;
        border-bottom: 1px solid var(--border);
        background: var(--card);
      }
      header h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
      header p { margin: 0; color: var(--muted); max-width: 40rem; font-size: 0.95rem; }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.75rem 1.25rem;
        background: var(--card);
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
      }
      nav a {
        font-size: 0.85rem;
        color: var(--accent);
        text-decoration: none;
        padding: 0.25rem 0;
      }
      nav a:hover { text-decoration: underline; }
      main { max-width: 44rem; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
      section {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        padding: 1rem 1.15rem;
        margin-bottom: 1rem;
      }
      section h2 { margin: 0 0 0.5rem; font-size: 1rem; }
      pre {
        margin: 0.5rem 0 0;
        padding: 0.75rem;
        border-radius: 0.35rem;
        background: color-mix(in srgb, var(--text) 6%, var(--card));
        font-size: 0.8rem;
        overflow: auto;
      }
      ul { margin: 0.35rem 0 0; padding-left: 1.2rem; color: var(--muted); font-size: 0.9rem; }
      .tag {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 0.2rem 0.45rem;
        border-radius: 0.25rem;
        background: color-mix(in srgb, var(--accent) 18%, transparent);
        color: var(--accent);
        margin-bottom: 0.35rem;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>python-deployher-pip</h1>
      <p>
        Static HTML emitted by <code>scripts/build.py</code> using
        <code>[tool.deployher]</code> in <code>pyproject.toml</code>. No MkDocs — just a deterministic
        build script you can extend (copy assets, run templating, etc.).
      </p>
    </header>
    <nav aria-label="On this page">
      <a href="#config">Config</a>
      <a href="#output">Output</a>
      <a href="#next">Next steps</a>
    </nav>
    <main>
      <section id="config">
        <span class="tag">pyproject</span>
        <h2>How this build is wired</h2>
        <p style="margin:0;color:var(--muted);font-size:0.9rem;">
          Deployher runs the command array in <code>buildCommand</code> and publishes <code>outputDir</code>.
        </p>
        <pre>[tool.deployher]
buildCommand = ["python", "scripts/build.py"]
outputDir = "dist"</pre>
      </section>
      <section id="output">
        <span class="tag">artifact</span>
        <h2>What gets deployed</h2>
        <ul>
          <li><code>dist/index.html</code> — this page</li>
          <li>Add CSS/JS under <code>dist/</code> from the script as you grow the example</li>
        </ul>
      </section>
      <section id="next">
        <span class="tag">ideas</span>
        <h2>Next steps</h2>
        <ul>
          <li>Vendor a small CSS file and copy it beside <code>index.html</code></li>
          <li>Generate multiple pages (e.g. <code>dist/status/index.html</code>) for multi-route static sites</li>
          <li>Read version from <code>pyproject.toml</code> and stamp the footer at build time</li>
        </ul>
      </section>
    </main>
  </body>
</html>
"""

(out_dir / "index.html").write_text(html, encoding="utf-8")
print("Built dist/index.html")
