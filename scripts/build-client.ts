import { buildClient } from "../src/client/build";

const result = await buildClient({ force: true });

if (!result.success) {
  process.exit(1);
}

console.log("Client assets built in dist/client.");
