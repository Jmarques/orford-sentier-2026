// ============================================================
// <site-masthead page="signaler|carte"></site-masthead>
// Renders the shared top bar (brand + nav) used on every page.
// Light DOM so shared/theme.css can style it directly.
// ============================================================
class SiteMasthead extends HTMLElement {
  connectedCallback() {
    const page = this.getAttribute('page') || '';
    const link = (href, label, key) =>
      `<a href="${href}"${page === key ? ' aria-current="page"' : ''}>${label}</a>`;

    this.innerHTML = `
      <a class="masthead__brand" href="index.html" aria-label="Orford-sur-le-Lac · Accueil">
        <svg class="masthead__mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M8 40 Q 16 28, 24 32 T 40 12"
                stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" fill="none" stroke-dasharray="2 4"/>
          <circle cx="8"  cy="40" r="3" fill="#c08a2f"/>
          <circle cx="40" cy="12" r="3" fill="#a4572e"/>
        </svg>
        <span class="masthead__brand-text">
          <span class="masthead__name">Orford-sur-le-Lac</span>
          <span class="masthead__sub">Entretien des sentiers</span>
        </span>
      </a>
      <nav class="masthead__nav" aria-label="Pages du site">
        ${link('index.html', 'Signaler', 'signaler')}
        ${link('map.html',   'Carte',    'carte')}
      </nav>
    `;
  }
}
customElements.define('site-masthead', SiteMasthead);
