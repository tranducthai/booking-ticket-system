import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * A SPA keeps the scroll position when the route changes, so opening an
 * event from the middle of a list landed mid-page. Scroll to the top on a
 * new page — but not on back/forward (POP: the browser restores where you
 * were), not when the link targets an anchor (#ve-ban-lai), and not for
 * query-only changes (tabs ?tab=, wizard ?buoc=), which keep the pathname.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash, navigationType]);

  return null;
}
