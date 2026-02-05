import { db } from "./src/db/db";
import * as schema from "./src/db/schema";
import { generateShortId } from "./src/utils/shortId";

const [project] = await db
  .insert(schema.projects)
  .values({
    name: "CSCD Purity Test",
    repoUrl: "https://github.com/dotcomnerd/cscdpuritytest",
  })
  .returning({ id: schema.projects.id });

if (project) {
  await db.insert(schema.deployments).values({
    projectId: project.id,
    shortId: generateShortId(),
    artifactPrefix: "cscdpuritytest/deployment-1",
    status: "success",
  });
}

console.log("Seeding complete.");
