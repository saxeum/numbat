// Apply the stored theme before paint. Dark is the default (set on <html>),
// so we only need to switch to light when the user chose it. Kept as an
// external file so it isn't blocked by the `script-src 'self'` CSP.
try {
  if (localStorage.getItem("foonix.theme") === "light") {
    document.documentElement.classList.remove("dark");
  }
} catch {
  /* ignore */
}
