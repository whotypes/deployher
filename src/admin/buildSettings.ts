import { eq, inArray } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";

export type BuildContainerConfig = {
  memory: string;
  cpus: string;
};

const DEFAULT_MEMORY = (process.env.BUILD_CONTAINER_MEMORY ?? "1g").trim();
const DEFAULT_CPUS = (process.env.BUILD_CONTAINER_CPUS ?? "0.5").trim();

const KEY_MEMORY = "build_container_memory";
const KEY_CPUS = "build_container_cpus";

export const getBuildContainerConfig = async (): Promise<BuildContainerConfig> => {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, [KEY_MEMORY, KEY_CPUS]));

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    memory: map.get(KEY_MEMORY)?.trim() || DEFAULT_MEMORY,
    cpus: map.get(KEY_CPUS)?.trim() || DEFAULT_CPUS
  };
};

export const updateBuildContainerConfig = async (
  updates: Partial<BuildContainerConfig>
): Promise<BuildContainerConfig> => {
  const now = new Date();
  if (updates.memory !== undefined) {
    await db
      .insert(schema.settings)
      .values({ key: KEY_MEMORY, value: updates.memory.trim(), updatedAt: now })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: updates.memory.trim(), updatedAt: now }
      });
  }
  if (updates.cpus !== undefined) {
    await db
      .insert(schema.settings)
      .values({ key: KEY_CPUS, value: updates.cpus.trim(), updatedAt: now })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: updates.cpus.trim(), updatedAt: now }
      });
  }
  return getBuildContainerConfig();
};
