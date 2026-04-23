// ============================================================
// <site-footer></site-footer>
// Shared footer rendered on every page. Light DOM so
// shared/theme.css can style it directly.
// ============================================================
class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <p class="site-footer__text">
        Comité d'entretien des sentiers · Orford-sur-le-Lac
      </p>
    `;
  }
}
customElements.define('site-footer', SiteFooter);
