export type RunResult = { ok: boolean; code: number; stdout: string; stderr: string };

export const runCommand = async (
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    input?: string;
    inheritStdio?: boolean;
  },
): Promise<RunResult> => {
  const env = { ...process.env, ...options?.env } as Record<string, string>;
  const proc = Bun.spawn(args, {
    cwd: options?.cwd,
    env,
    stdin:
      options?.input !== undefined
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(options!.input));
              controller.close();
            },
          })
        : "ignore",
    stdout: options?.inheritStdio ? "inherit" : "pipe",
    stderr: options?.inheritStdio ? "inherit" : "pipe",
  });

  let stdout = "";
  let stderr = "";
  if (!options?.inheritStdio) {
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    stdout = out;
    stderr = err;
  }

  const code = await proc.exited;
  return { ok: code === 0, code, stdout, stderr };
};

export const runCommandThrow = async (
  args: string[],
  options?: Parameters<typeof runCommand>[1],
): Promise<string> => {
  const r = await runCommand(args, options);
  if (!r.ok) {
    const msg = r.stderr.trim() || r.stdout.trim() || `command failed with exit ${r.code}`;
    throw new Error(msg);
  }
  return r.stdout;
};
