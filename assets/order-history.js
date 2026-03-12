/**
 * OrderHistoryList - Web Component for unified order history.
 * Fetches orders from the Order Service API (via Shopify App Proxy)
 * and renders a combined view of online (Shopify) and offline (POS) orders.
 */
class OrderHistoryList extends HTMLElement {
  constructor() {
    super();
    this.orders = [];
    this.filteredOrders = [];
    this.currentFilter = 'all';
    this.currentPage = 1;
    this.perPage = 20;
    this.productImages = {}; // handle -> image URL cache
  }

  connectedCallback() {
    this.proxyUrl = this.dataset.proxyUrl;
    this.fetchOrders();
  }

  async fetchOrders() {
    this.renderLoading();

    try {
      const response = await fetch(this.proxyUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (response.status === 401) {
        this.renderAuthError();
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch orders (${response.status})`);
      }

      const data = await response.json();
      this.orders = data.orders || [];

      await this.fetchProductImages();
      this.applyFilter();
    } catch (error) {
      console.error('Order history fetch error:', error);
      this.renderError(error.message);
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
        if (product.featured_image) {
          this.productImages[handle] = product.featured_image;
        }
      } catch (_) {
        // silently skip missing products
      }
    }));
  }

  applyFilter() {
    if (this.currentFilter === 'all') {
      this.filteredOrders = this.orders;
    } else {
      this.filteredOrders = this.orders.filter(
        (order) => order.source === this.currentFilter
      );
    }
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

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatCurrency(amount, currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  }

  formatStatus(status) {
    if (!status) return '';
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  renderLoading() {
    this.innerHTML = `
      <div class="order-history__loading" role="status">
        <p>Loading your order history...</p>
      </div>
    `;
  }

  renderAuthError() {
    this.innerHTML = `
      <p>Please log in to view your order history.</p>
    `;
  }

  renderError(message) {
    this.innerHTML = `
      <div class="order-history__error" role="alert">
        <p>Unable to load order history. Please try again later.</p>
      </div>
    `;
  }

  renderItemsRow(order, colSpan) {
    const items = order.items || [];
    if (items.length === 0) return '';

    const itemsHTML = items.map((item) => {
      const imgUrl = item.productHandle && this.productImages[item.productHandle];
      const imgHTML = imgUrl
        ? `<img class="order-history__item-img" src="${imgUrl}" alt="${item.productName}" width="60" height="60" loading="lazy">`
        : `<div class="order-history__item-img order-history__item-img--placeholder"></div>`;
      const wrap = (inner) => item.productHandle
        ? `<a href="/products/${item.productHandle}" class="order-history__item-link">${inner}</a>`
        : inner;

      return `
        <div class="order-history__item">
          ${wrap(imgHTML)}
          <div class="order-history__item-details">
            <span class="order-history__item-title">${item.productName}${item.variantName ? ` — ${item.variantName}` : ''}</span>
            <span class="order-history__item-meta">Qty: ${item.quantity} &nbsp;·&nbsp; ${this.formatCurrency(item.price, order.currency)}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <tr class="order-history__items-row" data-items-for="${order.sourceOrderId}" hidden>
        <td colspan="${colSpan}" class="order-history__items-cell">
          <div class="order-history__items-list">${itemsHTML}</div>
        </td>
      </tr>
    `;
  }

  render() {
    if (this.filteredOrders.length === 0 && this.orders.length === 0) {
      this.innerHTML = '<p>You haven\'t placed any orders yet.</p>';
      return;
    }

    const onlineCount = this.orders.filter((o) => o.source === 'shopify').length;
    const posCount = this.orders.filter((o) => o.source === 'pos').length;
    const colSpan = 5;

    const filtersHTML = `
      <div class="order-history__filters">
        <button class="order-history__filter-btn${this.currentFilter === 'all' ? ' active' : ''}"
                data-filter="all" type="button">
          All (${this.orders.length})
        </button>
        <button class="order-history__filter-btn${this.currentFilter === 'shopify' ? ' active' : ''}"
                data-filter="shopify" type="button">
          Online (${onlineCount})
        </button>
        <button class="order-history__filter-btn${this.currentFilter === 'pos' ? ' active' : ''}"
                data-filter="pos" type="button">
          In-Store (${posCount})
        </button>
      </div>
    `;

    const ordersHTML = this.paginatedOrders.length === 0
      ? '<p>No orders found for this filter.</p>'
      : `
        <table role="table" class="order-history">
          <caption class="visually-hidden">Order History</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th id="ColumnOrder" scope="col" role="columnheader">Order</th>
              <th id="ColumnDate" scope="col" role="columnheader">Date</th>
              <th id="ColumnSource" scope="col" role="columnheader">Source</th>
              <th id="ColumnPayment" scope="col" role="columnheader">Payment</th>
              <th id="ColumnTotal" scope="col" role="columnheader">Total</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            ${this.paginatedOrders.map((order) => `
              <tr role="row" class="order-history__order-row" data-order-id="${order.sourceOrderId}" aria-expanded="false">
                <td headers="ColumnOrder" role="cell" data-label="Order">
                  <button type="button" class="order-history__toggle" aria-label="Toggle items for order ${order.orderNumber}">
                    <span class="order-history__toggle-chevron">&#8250;</span>
                    ${order.orderNumber}
                  </button>
                </td>
                <td headers="ColumnDate" role="cell" data-label="Date">
                  <time datetime="${order.orderDate}">${this.formatDate(order.orderDate)}</time>
                </td>
                <td headers="ColumnSource" role="cell" data-label="Source">
                  <span class="order-history__badge order-history__badge--${order.source}">
                    ${order.source === 'shopify' ? 'Online' : 'In-Store'}
                  </span>
                </td>
                <td headers="ColumnPayment" role="cell" data-label="Payment">
                  ${this.formatStatus(order.financialStatus)}
                </td>
                <td headers="ColumnTotal" role="cell" data-label="Total">
                  ${this.formatCurrency(order.totalAmount, order.currency)}
                </td>
              </tr>
              ${this.renderItemsRow(order, colSpan)}
            `).join('')}
          </tbody>
        </table>
      `;

    const paginationHTML = this.totalPages > 1
      ? `
        <nav class="pagination order-history__pagination" role="navigation" aria-label="Order history pagination">
          <ul role="list">
            ${this.currentPage > 1
              ? `<li><button type="button" class="order-history__page-btn" data-page="${this.currentPage - 1}" aria-label="Previous page">&laquo;</button></li>`
              : ''}
            ${Array.from({ length: this.totalPages }, (_, i) => i + 1).map((page) => `
              <li>
                ${page === this.currentPage
                  ? `<span aria-current="page" aria-label="Page ${page}">${page}</span>`
                  : `<button type="button" class="order-history__page-btn" data-page="${page}" aria-label="Page ${page}">${page}</button>`}
              </li>
            `).join('')}
            ${this.currentPage < this.totalPages
              ? `<li><button type="button" class="order-history__page-btn" data-page="${this.currentPage + 1}" aria-label="Next page">&raquo;</button></li>`
              : ''}
          </ul>
        </nav>
      `
      : '';

    this.innerHTML = filtersHTML + ordersHTML + paginationHTML;

    // Accordion toggle
    this.querySelectorAll('.order-history__order-row').forEach((row) => {
      row.addEventListener('click', () => {
        const orderId = row.dataset.orderId;
        const itemsRow = this.querySelector(`[data-items-for="${orderId}"]`);
        const expanded = row.getAttribute('aria-expanded') === 'true';
        row.setAttribute('aria-expanded', String(!expanded));
        if (itemsRow) itemsRow.hidden = expanded;
      });
    });

    // Filter buttons
    this.querySelectorAll('.order-history__filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.dataset.filter;
        this.applyFilter();
      });
    });

    // Pagination
    this.querySelectorAll('.order-history__page-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentPage = parseInt(btn.dataset.page, 10);
        this.render();
      });
    });
  }
}

customElements.define('order-history-list', OrderHistoryList);
