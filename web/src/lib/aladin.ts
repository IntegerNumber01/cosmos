// Loads the self-hosted Aladin Lite 3.8.2 ES module once and resolves with its namespace.
/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    __AladinA?: any;
    __aladinPromise?: Promise<any>;
  }
}

export const ALADIN_SRC = "/vendor/aladin-lite-3.8.2.js";

export function loadAladin(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__AladinA) return Promise.resolve(window.__AladinA);
  if (window.__aladinPromise) return window.__aladinPromise;
  window.__aladinPromise = new Promise((resolve, reject) => {
    const onReady = () => resolve(window.__AladinA);
    window.addEventListener("aladin:ready", onReady, { once: true });
    window.addEventListener(
      "aladin:error",
      (e) => reject(new Error(String((e as CustomEvent).detail))),
      { once: true },
    );
    const s = document.createElement("script");
    s.type = "module";
    s.textContent = `
      import A from "${ALADIN_SRC}";
      try {
        await A.init;
        window.__AladinA = A;
        window.dispatchEvent(new Event("aladin:ready"));
      } catch (e) {
        window.dispatchEvent(new CustomEvent("aladin:error", { detail: String(e) }));
      }`;
    document.head.appendChild(s);
  });
  return window.__aladinPromise;
}
