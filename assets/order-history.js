class OrderHistoryList extends HTMLElement {
  constructor() {
    super();
    this.orders = [];
    this.filteredOrders = [];
    this.currentFilter = 'all';
    this.currentPage = 1;
    this.perPage = 20;
    this.productImages = {};
  }

  connectedCallback() {
    this.proxyUrl = this.dataset.proxyUrl;
    this.fetchOrders();
  }

  async fetchOrders() {
    this.renderLoading();
    try {
      const response = await fetch(this.proxyUrl, { headers: { Accept: 'application/json' } });
      if (response.status === 401) { this.renderAuthError(); return; }
      if (!response.ok) throw new Error(`Failed to fetch orders (${response.status})`);
      const data = await response.json();
      this.orders = data.orders || [];
      await this.fetchProductImages();
      this.applyFilter();
    } catch (error) {
      console.error('Order history fetch error:', error);
      this.renderError();
    }
  }

  async fetchProductImages() {
    const handles = new Set();
    for (const order of this.orders) {
      for (const item of order.items || []) {
        if (item.productHandle) handles.add(item.productHandle);
      }
    }
    await Promise.all([...handles].map(async (handle) => {
      try {
        const res = await fetch(`/products/${handle}.js`);
        if (!res.ok) return;
        const product = await res.json();
        if (product.featured_image) this.productImages[handle] = product.featured_image;
      } catch (_) {}
    }));
  }

  applyFilter() {
    this.filteredOrders = this.currentFilter === 'all'
      ? this.orders
      : this.orders.filter((o) => o.source === this.currentFilter);
    this.currentPage = 1;
    this.render();
  }

  get paginatedOrders() {
    const start = (this.currentPage - 1) * this.perPage;
    return this.filteredOrders.slice(start, start + this.perPage);
  }

  get totalPages() {
    return Math.ceil(this.filteredOrders.length / this.perPage);
  }

  formatDate(d) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatCurrency(amount, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  }

  formatStatus(s) {
    return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  }

  renderLoading() {
    this.innerHTML = `<div class="oh-loading"><p>Loading your order history...</p></div>`;
  }

  renderAuthError() {
    this.innerHTML = `<p>Please log in to view your order history.</p>`;
  }

  renderError() {
    this.innerHTML = `<div class="oh-error"><p>Unable to load order history. Please try again later.</p></div>`;
  }

  render() {
    if (this.orders.length === 0) {
      this.innerHTML = `<p>You haven't placed any orders yet.</p>`;
      return;
    }

    const onlineCount = this.orders.filter((o) => o.source === 'shopify').length;
    const posCount = this.orders.filter((o) => o.source === 'pos').length;

    const filtersHTML = `
      <div class="oh-filters">
        <button class="oh-filter${this.currentFilter === 'all' ? ' active' : ''}" data-filter="all" type="button">All (${this.orders.length})</button>
        <button class="oh-filter${this.currentFilter === 'shopify' ? ' active' : ''}" data-filter="shopify" type="button">Online (${onlineCount})</button>
        <button class="oh-filter${this.currentFilter === 'pos' ? ' active' : ''}" data-filter="pos" type="button">In-Store (${posCount})</button>
      </div>
    `;

    const ordersHTML = this.paginatedOrders.length === 0
      ? `<p class="oh-empty">No orders found.</p>`
      : `<div class="oh-list">
          ${this.paginatedOrders.map((order) => `
            <div class="oh-order" data-order-id="${order.sourceOrderId}">
              <button type="button" class="oh-order__header" aria-expanded="false">
                <div class="oh-order__primary">
                  <span class="oh-order__number">${order.orderNumber}</span>
                  <span class="oh-badge oh-badge--${order.source}">${order.source === 'shopify' ? 'Online' : 'In-Store'}</span>
                </div>
                <div class="oh-order__secondary">
                  <span class="oh-order__date">${this.formatDate(order.orderDate)}</span>
                  <span class="oh-order__status">${this.formatStatus(order.financialStatus)}</span>
                  <span class="oh-order__total">${this.formatCurrency(order.totalAmount, order.currency)}</span>
                  <span class="oh-chevron" aria-hidden="true">&#8250;</span>
                </div>
              </button>
              <div class="oh-order__items" hidden>
                ${(order.items || []).map((item) => {
                  const imgUrl = item.productHandle && this.productImages[item.productHandle];
                  const imgHTML = imgUrl
                    ? `<img class="oh-item__img" src="${imgUrl}" alt="${item.productName}" width="72" height="72" loading="lazy">`
                    : `<div class="oh-item__img oh-item__img--placeholder"></div>`;
                  const content = `
                    ${imgHTML}
                    <div class="oh-item__details">
                      <span class="oh-item__title">${item.productName}${item.variantName ? ` — ${item.variantName}` : ''}</span>
                      <span class="oh-item__meta">Qty: ${item.quantity}&nbsp;&nbsp;·&nbsp;&nbsp;${this.formatCurrency(item.price, order.currency)}</span>
                    </div>
                  `;
                  return item.productHandle
                    ? `<a href="/products/${item.productHandle}" class="oh-item">${content}</a>`
                    : `<div class="oh-item">${content}</div>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>`;

    const paginationHTML = this.totalPages > 1 ? `
      <nav class="oh-pagination" aria-label="Order history pages">
        ${this.currentPage > 1 ? `<button type="button" class="oh-page-btn" data-page="${this.currentPage - 1}">&laquo;</button>` : ''}
        ${Array.from({ length: this.totalPages }, (_, i) => i + 1).map((p) =>
          p === this.currentPage
            ? `<span class="oh-page-btn oh-page-btn--current" aria-current="page">${p}</span>`
            : `<button type="button" class="oh-page-btn" data-page="${p}">${p}</button>`
        ).join('')}
        ${this.currentPage < this.totalPages ? `<button type="button" class="oh-page-btn" data-page="${this.currentPage + 1}">&raquo;</button>` : ''}
      </nav>` : '';

    this.innerHTML = filtersHTML + ordersHTML + paginationHTML;

    // Accordion
    this.querySelectorAll('.oh-order__header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        btn.nextElementSibling.hidden = expanded;
      });
    });

    // Filters
    this.querySelectorAll('.oh-filter').forEach((btn) => {
      btn.addEventListener('click', () => { this.currentFilter = btn.dataset.filter; this.applyFilter(); });
    });

    // Pagination
    this.querySelectorAll('.oh-page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => { this.currentPage = parseInt(btn.dataset.page, 10); this.render(); });
    });
  }
}

customElements.define('order-history-list', OrderHistoryList);
