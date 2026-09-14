import type { Database } from "./database.types.ts";

/**
 * Derived from the generated schema types rather than duplicated by hand, and
 * deliberately not imported from the frontend: the backend owns no frontend
 * code, so the dependency between the two folders runs one way only.
 *
 * `room_role` is a Postgres enum, so this stays correct by construction — add a
 * role in a migration, regenerate, and every handler typechecks against it.
 */
export type RoomRole = Database["public"]["Enums"]["room_role"];
