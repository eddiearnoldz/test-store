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
      const res = await fetch(this.proxyUrl, { headers: { Accept: 'application/json' } });
      if (res.status === 401) { this.renderAuthError(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.orders = data.orders || [];
      await this.fetchProductImages();
      this.applyFilter();
    } catch (e) {
      console.error(e);
      this.renderError();
    }
  }

  async fetchProductImages() {
    const handles = [...new Set(
      this.orders.flatMap((o) => (o.items || []).map((i) => i.productHandle).filter(Boolean))
    )];
    await Promise.all(handles.map(async (handle) => {
      try {
        const res = await fetch(`/products/${handle}.js`);
        if (!res.ok) return;
        const p = await res.json();
        if (p.featured_image) this.productImages[handle] = p.featured_image;
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

  fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  fmtCurrency(n, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  }

  fmtStatus(s) {
    return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
  }

  async cancelOrder(sourceOrderId, btn) {
    if (btn.classList.contains('oh-cancel-btn--busy')) return;
    btn.classList.add('oh-cancel-btn--busy');
    btn.textContent = 'Cancelling...';

    try {
      const baseUrl = this.proxyUrl.split('?')[0].replace(/\/orders$/, '');
      const res = await fetch(`${baseUrl}/orders/${sourceOrderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        btn.textContent = 'Cancelled';
        btn.classList.add('oh-cancel-btn--done');
        const order = this.orders.find((o) => o.sourceOrderId === sourceOrderId);
        if (order) order.status = 'cancelled';
      } else {
        btn.classList.remove('oh-cancel-btn--busy');
        btn.textContent = 'Cancel Order';
        this.showToast('Order cancellation unsuccessful. Please contact customer support.');
      }
    } catch (_) {
      btn.classList.remove('oh-cancel-btn--busy');
      btn.textContent = 'Cancel Order';
      this.showToast('Order cancellation unsuccessful. Please contact customer support.');
    }
  }

  showToast(message) {
    const existing = document.querySelector('.oh-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'oh-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('oh-toast--visible'));

    setTimeout(() => {
      toast.classList.remove('oh-toast--visible');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  renderLoading()   { this.innerHTML = `<div class="oh-state">Loading your order history…</div>`; }
  renderAuthError() { this.innerHTML = `<div class="oh-state">Please log in to view your order history.</div>`; }
  renderError()     { this.innerHTML = `<div class="oh-state oh-state--error">Unable to load order history. Please try again later.</div>`; }

  render() {
    if (this.orders.length === 0) {
      this.innerHTML = `<div class="oh-state">You haven't placed any orders yet.</div>`;
      return;
    }

    const onlineCount = this.orders.filter((o) => o.source === 'shopify').length;
    const posCount    = this.orders.filter((o) => o.source === 'pos').length;

    const filters = `
      <div class="oh-filters">
        <button class="oh-filter${this.currentFilter === 'all'     ? ' is-active' : ''}" data-filter="all"     type="button">All (${this.orders.length})</button>
        <button class="oh-filter${this.currentFilter === 'shopify' ? ' is-active' : ''}" data-filter="shopify" type="button">Online (${onlineCount})</button>
        <button class="oh-filter${this.currentFilter === 'pos'     ? ' is-active' : ''}" data-filter="pos"     type="button">In-Store (${posCount})</button>
      </div>`;

    const noOrders = this.paginatedOrders.length === 0;

    const table = noOrders ? `<p class="oh-state">No orders match this filter.</p>` : `
      <div class="oh-table">

        <div class="oh-table__head">
          <div class="oh-col oh-col--id">Order</div>
          <div class="oh-col oh-col--source">Source</div>
          <div class="oh-col oh-col--date">Date</div>
          <div class="oh-col oh-col--payment">Payment</div>
          <div class="oh-col oh-col--total">Total</div>
          <div class="oh-col oh-col--chevron"></div>
        </div>

        ${this.paginatedOrders.map((order) => `
          <div class="oh-order">

            <button type="button" class="oh-order__row" aria-expanded="false" data-order-id="${order.sourceOrderId}">
              <div class="oh-col oh-col--id">${order.orderNumber}</div>
              <div class="oh-col oh-col--source">
                <span class="oh-badge oh-badge--${order.source}">${order.source === 'shopify' ? 'Online' : 'In-Store'}</span>
              </div>
              <div class="oh-col oh-col--date">${this.fmtDate(order.orderDate)}</div>
              <div class="oh-col oh-col--payment">${this.fmtStatus(order.financialStatus)}</div>
              <div class="oh-col oh-col--total">${this.fmtCurrency(order.totalAmount, order.currency)}</div>
              <div class="oh-col oh-col--chevron"><span class="oh-chevron">&#8250;</span></div>
            </button>

            <div class="oh-items">
              <div class="oh-items__head">
                <div class="oh-icol oh-icol--img"></div>
                <div class="oh-icol oh-icol--title">Product</div>
                <div class="oh-icol oh-icol--qty">Qty</div>
                <div class="oh-icol oh-icol--price">Price</div>
              </div>
              ${(order.items || []).map((item) => {
                const imgUrl = item.productHandle && this.productImages[item.productHandle];
                const img = imgUrl
                  ? `<img class="oh-item__img" src="${imgUrl}" alt="${item.productName}" width="64" height="64" loading="lazy">`
                  : `<div class="oh-item__img oh-item__img--empty"></div>`;
                const inner = `
                  <div class="oh-icol oh-icol--img">${img}</div>
                  <div class="oh-icol oh-icol--title">${item.productName}${item.variantName ? `<br><small>${item.variantName}</small>` : ''}</div>
                  <div class="oh-icol oh-icol--qty">${item.quantity}</div>
                  <div class="oh-icol oh-icol--price">${this.fmtCurrency(item.price, order.currency)}</div>
                `;
                return item.productHandle
                  ? `<a href="/products/${item.productHandle}" class="oh-item">${inner}</a>`
                  : `<div class="oh-item">${inner}</div>`;
              }).join('')}

              ${order.source === 'shopify' && order.fulfillmentStatus === 'unfulfilled' && order.status !== 'cancelled' ? `
                <div class="oh-cancel-row">
                  <div class="oh-cancel-btn" data-source-order-id="${order.sourceOrderId}">
                    Cancel Order
                  </div>
                </div>
              ` : ''}
            </div>

          </div>
        `).join('')}
      </div>`;

    const pagination = this.totalPages > 1 ? `
      <div class="oh-pagination">
        ${this.currentPage > 1 ? `<button type="button" class="oh-page" data-page="${this.currentPage - 1}">&laquo;</button>` : ''}
        ${Array.from({ length: this.totalPages }, (_, i) => i + 1).map((p) =>
          p === this.currentPage
            ? `<span class="oh-page oh-page--current">${p}</span>`
            : `<button type="button" class="oh-page" data-page="${p}">${p}</button>`
        ).join('')}
        ${this.currentPage < this.totalPages ? `<button type="button" class="oh-page" data-page="${this.currentPage + 1}">&raquo;</button>` : ''}
      </div>` : '';

    this.innerHTML = filters + table + pagination;

    // Accordion — toggle class, not hidden attribute (avoids CSS override issues)
    this.querySelectorAll('.oh-order__row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        btn.nextElementSibling.classList.toggle('oh-items--open', !open);
      });
    });

    // Cancel divs
    this.querySelectorAll('.oh-cancel-btn').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelOrder(el.dataset.sourceOrderId, el);
      });
    });

    this.querySelectorAll('.oh-filter').forEach((btn) => {
      btn.addEventListener('click', () => { this.currentFilter = btn.dataset.filter; this.applyFilter(); });
    });

    this.querySelectorAll('.oh-page[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => { this.currentPage = parseInt(btn.dataset.page, 10); this.render(); });
    });
  }
}

customElements.define('order-history-list', OrderHistoryList);
