// A static host without rewrites (GitHub Pages) answers a deep link like `<base>waiting/acme/app/105` with its 404 page. That page sends the
// browser to the demo's root with the asked path in `?__path=`; here it becomes the page's address again, before the app reads the URL.
const asked = new URLSearchParams(location.search).get("__path");
if (asked?.startsWith(import.meta.env.BASE_URL)) history.replaceState(null, "", asked);
export {};
