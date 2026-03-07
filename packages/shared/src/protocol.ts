import type { Anchor, Comment, Reaction, UserPresence } from "./types.js";

// Client → Server messages
export type ClientMessage =
  | { type: "user:join"; name: string; email: string }
  | { type: "user:set_name"; name: string }
  | { type: "presence:update"; selection?: { anchor: Anchor; text: string } }
  | {
      type: "comment:create";
      id: string;
      content: string;
      anchor: Anchor | null;
      parent_id: string | null;
    }
  | { type: "comment:update"; id: string; content: string }
  | { type: "comment:delete"; id: string }
  | { type: "comment:resolve"; id: string; resolved: boolean }
  | { type: "reaction:add"; id: string; emoji: string; anchor: Anchor }
  | { type: "reaction:remove"; id: string };

// Server → Client messages
export type ServerMessage =
  | { type: "users:list"; users: UserPresence[] }
  | { type: "comments:list"; comments: Comment[] }
  | { type: "user:joined"; user: UserPresence }
  | { type: "user:left"; email: string }
  | { type: "user:name_set"; email: string; name: string }
  | { type: "presence:updated"; email: string; selection?: { anchor: Anchor; text: string } }
  | { type: "comment:created"; comment: Comment }
  | { type: "comment:updated"; comment: Comment }
  | { type: "comment:deleted"; id: string }
  | { type: "comment:resolved"; id: string; resolved: boolean }
  | { type: "reactions:list"; reactions: Reaction[] }
  | { type: "reaction:added"; reaction: Reaction }
  | { type: "reaction:removed"; id: string }
  | { type: "error"; message: string };
