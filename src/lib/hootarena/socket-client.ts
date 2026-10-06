"use client";

import { io, type Socket } from "socket.io-client";
import type { HootServerToClientEvents, HootClientToServerEvents } from "@/lib/hootarena/socket-events";

let socket: Socket<HootServerToClientEvents, HootClientToServerEvents> | null = null;

/** One shared connection per browser tab to the dedicated `/hootarena` namespace - fully separate from the legacy LIVE-mode socket in `@/lib/socket-client`. */
export function getHootSocket() {
  if (!socket) {
    socket = io("/hootarena", { path: "/socket.io", autoConnect: true });
  }
  return socket;
}
