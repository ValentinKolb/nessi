import { db } from "../../shared/db/db.js";
import { dbMigrate } from "../../shared/db/db-migrate.js";
import { skillRegistry } from "../../skills/core/index.js";

export const appBoot = {
  async init() {
    await db.init();
    await dbMigrate.run();
    await skillRegistry.ensureLoaded();
  },
} as const;
