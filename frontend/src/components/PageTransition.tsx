import { ViewTransition, type ReactNode } from "react";

// Links tag navigations with these types; anything else crossfades.
export const NAV_FORWARD = ["nav-forward"];
export const NAV_BACK = ["nav-back"];

const BY_TYPE = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "page-fade",
};

// Wraps a page's content so route changes animate. Must live in each page,
// not the layout (layouts persist, so they never enter or exit).
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">
      {children}
    </ViewTransition>
  );
}
