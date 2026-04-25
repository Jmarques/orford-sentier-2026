// ============================================================
// Shared runtime config for all pages.
// Exposed as a single window global so non-module <script> tags
// in each HTML page can read it without bundling.
// ============================================================
window.ORFORD = {
  ENDPOINT_URL: 'https://script.google.com/macros/s/AKfycbxVDS9FL277cM59nMDyHfCF4U9g8Z-IKsywrPciLLONHvi7tjStcyzasgPA2jfpwzPoww/exec',

  // Default map view — used by map.html overview and by both
  // map pickers (form + admin drawer) so they all start aligned.
  MAP_CENTER: [45.32, -72.23],
  MAP_ZOOM:   12
};
