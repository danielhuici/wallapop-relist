(() => {
  const RELIST_BTN_CLASS = 'wallapop-relist-btn';

  // Localized string for the current browser language (see _locales/).
  const t = (key) => chrome.i18n.getMessage(key);

  function createRelistButton(slug) {
    const btn = document.createElement('button');
    btn.className = RELIST_BTN_CLASS;
    btn.dataset.slug = slug;
    btn.textContent = t('btnRelist');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRelist(btn, slug);
    });
    return btn;
  }

  function looksLikeJwt(value) {
    return typeof value === 'string' && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value.trim());
  }

  // Reads the auth token page-side and hands it to the background worker.
  function findPageAccessToken() {
    // The accessToken cookie isn't HttpOnly, so we can read it directly.
    const cookieMatch = document.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
    if (cookieMatch) {
      return decodeURIComponent(cookieMatch[1]).trim();
    }

    // Fallback: local/session storage.
    for (const store of [window.localStorage, window.sessionStorage]) {
      let keys;
      try {
        keys = Object.keys(store);
      } catch (e) {
        continue;
      }
      for (const key of keys) {
        const val = store.getItem(key);
        if (!val) continue;

        // Value is the raw JWT.
        if (looksLikeJwt(val)) return val.trim();

        // Value is JSON wrapping the token.
        if (val.includes('access') || val.includes('token')) {
          try {
            const parsed = JSON.parse(val);
            const candidate = parsed.accessToken || parsed.access_token || parsed.token;
            if (looksLikeJwt(candidate)) return candidate.trim();
          } catch (e) {
            // not JSON, ignore
          }
        }
      }
    }

    console.warn('[Wallapop Relist] no access token found');
    return null;
  }

  async function handleRelist(btn, slug) {
    btn.disabled = true;
    btn.classList.add('wallapop-relist-btn--loading');
    btn.textContent = t('btnRelisting');

    try {
      const accessToken = findPageAccessToken();
      const response = await chrome.runtime.sendMessage({
        action: 'relist',
        slug: slug,
        accessToken: accessToken
      });

      if (response.success) {
        btn.classList.remove('wallapop-relist-btn--loading');
        btn.classList.add('wallapop-relist-btn--success');
        btn.textContent = t('btnRelisted');
        setTimeout(() => location.reload(), 2000);
      } else {
        throw new Error(response.error || t('errUnknown'));
      }
    } catch (error) {
      console.error('[Wallapop Relist] relist failed:', error);
      btn.classList.remove('wallapop-relist-btn--loading');
      btn.classList.add('wallapop-relist-btn--error');
      btn.textContent = t('btnError');
      btn.title = error.message;
      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove('wallapop-relist-btn--error');
        btn.textContent = t('btnRelist');
        btn.title = '';
      }, 3000);
    }
  }

  // Wallapop URLs are `/item/<slug>`
  function extractSlugFromCard(card) {
    const link = card.querySelector('a[href*="/item/"]');
    if (link) {
      const match = link.getAttribute('href').match(/\/item\/([a-z0-9-]+)/i);
      if (match) return match[1];
    }
    return null;
  }

  function extractSlugFromUrl() {
    const match = window.location.pathname.match(/\/item\/([a-z0-9-]+)/i);
    return match ? match[1] : null;
  }

  function injectDetailPageButton() {
    const slug = extractSlugFromUrl();
    if (!slug) return;

    // Seller buttons live in more than one responsive container; inject into
    // all of them so the button shows at any viewport size.
    const containers = new Set();

    // By known container class.
    document
      .querySelectorAll('[class*="ItemDetailSellerButtons"]')
      .forEach((el) => containers.add(el));

    // Fallback: the parent of any "Editar" button.
    document.querySelectorAll('walla-button').forEach((el) => {
      if (el.textContent.trim().toLowerCase() === 'editar' && el.parentElement) {
        containers.add(el.parentElement);
      }
    });

    containers.forEach((container) => {
      if (container.querySelector(`.${RELIST_BTN_CLASS}`)) return;
      const btn = createRelistButton(slug);
      btn.classList.add('wallapop-relist-btn--detail');
      container.appendChild(btn);
    });
  }

  function injectButtons() {
    // Item detail page
    if (window.location.pathname.startsWith('/item/')) {
      injectDetailPageButton();
    }

    // Catalog grid cards
    const cards = document.querySelectorAll('tsl-catalog-item');

    cards.forEach((card) => {
      if (card.querySelector(`.${RELIST_BTN_CLASS}`)) return;

      const slug = extractSlugFromCard(card);
      if (!slug) return;

      const actionsDiv = card.querySelector('.actions');
      if (actionsDiv) {
        const btn = createRelistButton(slug);
        actionsDiv.appendChild(btn);
      }
    });
  }

  function observe() {
    const observer = new MutationObserver(() => {
      injectButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    injectButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
