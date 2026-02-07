from pathlib import Path

out_dir = Path("dist")
out_dir.mkdir(parents=True, exist_ok=True)

html = """<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>python-pdploy-pip</title>
  </head>
  <body>
    <h1>python-pdploy-pip</h1>
    <p>This was built by Python using [tool.pdploy] config in pyproject.toml.</p>
  </body>
</html>
"""

(out_dir / "index.html").write_text(html, encoding="utf-8")
print("Built dist/index.html")
