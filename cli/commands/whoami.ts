import type { Command } from "commander";
import pc from "picocolors";

import { readManagedCliConfig } from "../lib/api-config";
import { apiFetchJson } from "../lib/api-client";

export const registerWhoami = (program: Command): void => {
  program
    .command("whoami")
    .description("Print the current user from the stored CLI token")
    .action(async () => {
      const loaded = await readManagedCliConfig();
      if (!loaded) {
        throw new Error('Not logged in. Run `deployher login`.');
      }
      const res = await apiFetchJson<{
        user: { id: string; email: string; name: string | null; role: string };
      }>(loaded.config, "/api/cli/whoami");
      if (!res.ok) {
        throw new Error(pc.red(res.message));
      }
      const u = res.data.user;
      console.log(`${u.email} (${u.role})`);
      console.log(pc.dim(u.id));
    });
};
