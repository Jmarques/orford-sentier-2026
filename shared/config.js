// ============================================================
// Shared runtime config for all pages.
// Exposed as a single window global so non-module <script> tags
// in each HTML page can read it without bundling.
// ============================================================
window.ORFORD = {
  ENDPOINT_URL: 'https://script.google.com/macros/s/AKfycbwTWmXQunhvNta7i_CblgrdHLOf3eJuYGQbn6ST_kMhm72WIR1VWJ6Y2gMjfxIB229z/exec',

  // Default map view — used by map.html overview and by both
  // map pickers (form + admin drawer) so they all start aligned.
  MAP_CENTER: [45.32, -72.23],
  MAP_ZOOM:   12
};
