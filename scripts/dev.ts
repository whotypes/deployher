const server = Bun.spawn(["bun", "--hot", "src/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, SKIP_CLIENT_BUILD: "1" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const client = Bun.spawn(["bun", "run", "dev:vite"], {
  cwd: process.cwd(),
  env: process.env,
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
