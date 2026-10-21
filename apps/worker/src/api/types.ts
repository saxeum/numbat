import type { Auth } from "../auth";

type SessionData = Auth["$Infer"]["Session"];

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    user: SessionData["user"];
    session: SessionData["session"];
    /** Owner id, set by either session-cookie or API-key auth. */
    userId: string;
  };
};
