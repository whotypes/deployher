import type { Command } from "commander";
import pc from "picocolors";

import { deleteManagedCliConfig, defaultConfigPath } from "../lib/api-config";

export const registerLogout = (program: Command): void => {
  program.command("logout").description("Remove the locally stored CLI API token").action(async () => {
    const removed = await deleteManagedCliConfig();
    if (removed) {
      console.log(pc.green(`Removed ${defaultConfigPath()}`));
    } else {
      console.log(pc.dim("No CLI config file to remove."));
    }
  });
};
