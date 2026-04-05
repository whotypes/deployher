import type { ListrTask } from "listr2";
import { Listr } from "listr2";
import type { CliContext } from "./types";

export const createListr = (
  ctx: CliContext,
  tasks: ListrTask[],
): Listr => {
  const silent = ctx.logLevel === "quiet" || ctx.ci;
  return new Listr(tasks, {
    concurrent: false,
    rendererOptions: {
      collapseSubtasks: false,
      showTimer: ctx.logLevel === "verbose",
    },
    renderer: silent ? "silent" : "default",
    collectErrors: "full",
  });
};

export const taskLog =
  (ctx: CliContext, task: { output?: string }) =>
  (message: string): void => {
    if (ctx.logLevel === "verbose") {
      task.output = message;
    }
  };
