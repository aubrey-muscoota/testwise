// Web: overlays render into <body>, so a sheet's scrim covers the whole window,
// the wide sidebar included, whatever screen opened it.
import React from "react";
// @ts-expect-error react-dom ships no types in this project; only createPortal is used.
import { createPortal } from "react-dom";

export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body) as React.ReactElement;
}
