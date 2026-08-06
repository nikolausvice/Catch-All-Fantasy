"use client";

import { useEffect } from "react";

/**
 * Measures one element's rendered height and publishes it as a CSS variable
 * on the document root, kept live with a ResizeObserver. Lets a sticky
 * descendant stack itself with `top: var(--x)` against a real, current
 * measurement instead of a guessed pixel value that silently drifts out of
 * sync the moment the measured element's own height changes (a responsive
 * breakpoint, a wrapped line, a font load) — exactly the kind of drift that
 * caused a stray gap between the site header and a sticky panel beneath it.
 */
export function ElementHeightVar({ selector, varName }: { selector: string; varName: string }) {
  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el) return;

    const setVar = () => {
      document.documentElement.style.setProperty(varName, `${el.getBoundingClientRect().height}px`);
    };
    setVar();

    const observer = new ResizeObserver(setVar);
    observer.observe(el);
    return () => observer.disconnect();
  }, [selector, varName]);

  return null;
}
