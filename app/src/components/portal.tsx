// Native: overlays render in place (the screen already fills the window).
import React from "react";

export function Portal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
