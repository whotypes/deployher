/**
 * Bun API (uses PORT from .env, usually 3000) + Vite/Start on 5173 (--port in dev:vite).
 * Vite's child env omits PORT so nothing tries to bind the API port for the dev UI.
 * Run preview-runner in another terminal; avoid `bun run start:preview-runner &` in the same shell
 * as this script if you use Ctrl+C — job control can SIGTERM background jobs.
 */
const server = Bun.spawn(["bun", "--hot", "src/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, SKIP_CLIENT_BUILD: "1" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const viteEnv = { ...process.env };
delete viteEnv.PORT;

const client = Bun.spawn(["bun", "run", "dev:vite"], {
  cwd: process.cwd(),
  env: viteEnv,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const children = [server, client];

const stopChildren = (signal?: NodeJS.Signals) => {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill(signal ?? "SIGTERM");
    }
  }
};

process.on("SIGINT", () => {
  stopChildren("SIGINT");
});

process.on("SIGTERM", () => {
  stopChildren("SIGTERM");
});

const exits = await Promise.race(
  children.map(async (child) => ({
    child,
    code: await child.exited,
  })),
);

stopChildren();

if (exits.code !== 0) {
  process.exit(exits.code);
}
