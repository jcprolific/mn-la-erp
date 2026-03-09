/* ============================================================
   MN+LA Master Access – Dashboard Logic
   ============================================================ */

(function () {
  'use strict';

  /* ---------- MUTED PALETTE ----------
     All hues are desaturated / darkened so they read as
     refined accents, not neon highlights.
  ----------------------------------------------------------- */
  const PALETTE = {
    sage: { hex: '#7aad8a', rgba: (a) => `rgba(122,173,138,${a})` },  // Store Ops
    slate: { hex: '#7a9fc4', rgba: (a) => `rgba(122,159,196,${a})` },  // Inventory
    mauve: { hex: '#9d87b5', rgba: (a) => `rgba(157,135,181,${a})` },  // Ecommerce
    sand: { hex: '#a8935c', rgba: (a) => `rgba(168,147,92,${a})` },  // Manufacturing
    stone: { hex: '#8f9fb0', rgba: (a) => `rgba(143,159,176,${a})` },  // HR
    clay: { hex: '#a07878', rgba: (a) => `rgba(160,120,120,${a})` },  // Finance
    graphite: { hex: '#787878', rgba: (a) => `rgba(120,120,120,${a})` },  // Accounting
  };

  /* ---------- DATA ---------- */

  const notifications = [
    { id: 'low-stock-wh', title: 'Low Stock (Warehouse)', count: 8, icon: 'warehouse', desc: 'Items at or below reorder point' },
    { id: 'low-stock-store', title: 'Low Stock (Stores)', count: 5, icon: 'store', desc: 'Store shelves running low' },
    { id: 'checks-due', title: 'Checks Due', count: 3, icon: 'event_note', desc: 'Checks maturing this week' },
    { id: 'for-payment', title: 'For Payment Pending', count: 12, icon: 'payments', desc: 'Payments awaiting approval' },
    { id: 'late-employees', title: 'Late Employees Today', count: 2, icon: 'schedule', desc: 'Did not clock in on time' },
    { id: 'leave-requests', title: 'Leave Requests Pending', count: 4, icon: 'event_busy', desc: 'Awaiting manager approval' },
    { id: 'ir-pending', title: 'IR Pending', count: 1, icon: 'report_problem', desc: 'Incident reports unacknowledged' },
    { id: 'overdue-subcon', title: 'Overdue Job Orders', count: 6, icon: 'precision_manufacturing', desc: 'Past target completion date' },
    { id: 'cod-not-remitted', title: 'COD Not Remitted', count: 9, icon: 'delivery_dining', desc: 'COD collections not yet deposited' },
  ];

  const mainModules = [
    {
      id: 'module-store',
      label: 'Store Operations',
      icon: 'storefront',
      url: 'store.html',
      allowedRoles: ['owner', 'admin', 'store_associate'],
      p: PALETTE.sage,
    },
    {
      id: 'module-inventory',
      label: 'Inventory & Warehouse',
      icon: 'inventory_2',
      url: 'inventory.html',
      allowedRoles: ['owner', 'admin', 'warehouse_staff', 'store_associate'],
      p: PALETTE.slate,
    },
    {
      id: 'module-ecommerce',
      label: 'Ecommerce',
      icon: 'language',
      url: '#',
      allowedRoles: ['owner', 'admin', 'warehouse_staff'],
      p: PALETTE.mauve,
    },
    {
      id: 'module-manufacturing',
      label: 'Manufacturing',
      icon: 'precision_manufacturing',
      url: '#',
      allowedRoles: ['owner', 'admin'],
      p: PALETTE.sand,
    },
    {
      id: 'module-hr',
      label: 'HR / Staff',
      icon: 'groups',
      url: 'staff.html',
      allowedRoles: ['owner', 'admin'],
      p: PALETTE.stone,
    },
    {
      id: 'module-finance',
      label: 'Finance',
      icon: 'account_balance',
      url: '#',
      allowedRoles: ['owner', 'admin'],
      p: PALETTE.clay,
    },
    {
      id: 'module-accounting',
      label: 'Accounting',
      icon: 'receipt_long',
      url: '#',
      allowedRoles: ['owner', 'admin'],
      p: PALETTE.graphite,
    },
  ];

  const pendingActions = [
    { title: 'Orders to Pack', count: 4, icon: 'inventory_2', sub: 'Ecommerce packing queue', urgent: true },
    { title: 'Transfers Pending', count: 2, icon: 'sync_alt', sub: 'Warehouse → Store transfers', urgent: false },
    { title: 'Restock Requests Pending', count: 3, icon: 'add_shopping_cart', sub: 'From store operations', urgent: false },
    { title: 'Checks Due This Week', count: 3, icon: 'event_note', sub: 'Maturing within 7 days', urgent: true },
    { title: 'Overdue Job Orders', count: 6, icon: 'precision_manufacturing', sub: 'Past target completion date', urgent: true },
    { title: 'COD Not Yet Remitted', count: 9, icon: 'delivery_dining', sub: 'Rider collections outstanding', urgent: true },
  ];


  /* ---------- RENDERERS ---------- */

  function renderNotifications() {
    const container = document.getElementById('notifScroll');
    if (!container) return;
    container.innerHTML = notifications.map(n => {
      const isAlert = n.count > 0;
      return `
        <div class="notif-card${isAlert ? ' notif-card--alert' : ''}" data-id="${n.id}">
          <div class="notif-card__header">
            <div class="notif-card__icon"><span class="material-icons-round">${n.icon}</span></div>
            <div class="notif-card__count">${n.count}</div>
          </div>
          <div class="notif-card__title">${n.title}</div>
          <div class="notif-card__desc">${n.desc}</div>
        </div>`;
    }).join('');
  }

  function renderModules() {
    const userRole = window.Auth?.profile?.role || 'store_associate';
    const container = document.getElementById('modulesSection');
    if (!container) return;

    const items = mainModules
      .filter(m => m.allowedRoles.includes(userRole))
      .map(m => `
        <a href="${m.url}" class="module-card module-card--hoverable" id="${m.id}" style="text-decoration:none;">
          <div class="module-card__icon" style="
            background: ${m.p.rgba(0.12)};
            color: ${m.p.hex};
            border: 1px solid ${m.p.rgba(0.2)};
          ">
            <span class="material-icons-round" style="font-size:28px;">${m.icon}</span>
          </div>
          <div class="module-card__label">${m.label}</div>
          <div class="module-card__sub">Tap to open dashboard</div>
          <div class="module-card__accent" style="background:${m.p.rgba(0.5)};"></div>
        </a>`).join('');

    container.innerHTML = `
          <style>
            /* ── Module card layout ── */
            .main-module-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
              gap: 16px;
            }
            .module-card {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              padding: 22px 20px 18px;
              background: var(--bg-card);
              border: 1px solid rgba(255,255,255,.05);
              border-radius: 14px;
              cursor: pointer;
              transition: background .2s, transform .2s, border-color .2s;
              position: relative;
              overflow: hidden;
            }
            .module-card:hover {
              background: var(--bg-card-hover);
              transform: translateY(-2px);
              border-color: rgba(255,255,255,.1);
            }
            .module-card__icon {
              width: 46px;
              height: 46px;
              border-radius: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 14px;
              flex-shrink: 0;
            }
            .module-card__label {
              font-size: .9rem;
              font-weight: 600;
              color: var(--text-primary);
              margin-bottom: 3px;
              line-height: 1.3;
            }
            .module-card__sub {
              font-size: .72rem;
              color: var(--text-muted);
            }
            /* Thin colored bottom accent line */
            .module-card__accent {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 2px;
              opacity: 0;
              transition: opacity .2s;
              border-radius: 0 0 14px 14px;
            }
            .module-card:hover .module-card__accent {
              opacity: 1;
            }
          </style>
          <div class="main-module-grid">${items}</div>`;
  }

  function renderPendingActions() {
    const container = document.getElementById('pendingList');
    container.innerHTML = pendingActions.map(p => `
      <div class="pending-item${p.urgent ? ' pending-item--urgent' : ''}">
        <div class="pending-item__icon"><span class="material-icons-round">${p.icon}</span></div>
        <div class="pending-item__info">
          <div class="pending-item__title">${p.title}</div>
          <div class="pending-item__subtitle">${p.sub}</div>
        </div>
        <div class="pending-item__badge${p.count === 0 ? ' pending-item__badge--low' : ''}">${p.count}</div>
        <span class="material-icons-round pending-item__arrow">chevron_right</span>
      </div>`).join('');
  }

  function updateNavBadge() {
    const total = notifications.reduce((sum, n) => sum + n.count, 0);
    const badge = document.getElementById('navNotifBadge');
    badge.textContent = total > 99 ? '99+' : total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }


  /* ---------- FETCH LIVE METRICS ---------- */
  async function fetchLiveMetrics() {
    if (!window.db) return;
    try {
      const { count, error } = await window.db
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .lt('quantity', 10);
      if (!error && count !== null) {
        const whNotif = notifications.find(n => n.id === 'low-stock-wh');
        if (whNotif) whNotif.count = count;
        const storeNotif = notifications.find(n => n.id === 'low-stock-store');
        if (storeNotif) storeNotif.count = 0;
      }
    } catch (err) {
      console.error('Failed to fetch live metrics:', err);
    }
  }


  /* ---------- INTERACTIONS ---------- */

  const profileWrapper = document.getElementById('profileWrapper');
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileWrapper.classList.toggle('open');
    });
  }
  document.addEventListener('click', () => {
    if (profileWrapper) profileWrapper.classList.remove('open');
  });

  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileSidebar = document.getElementById('mobileSidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const closeSidebar = document.getElementById('closeSidebar');

  function openSidebar() {
    if (mobileSidebar) mobileSidebar.classList.add('open');
    if (mobileOverlay) mobileOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebarFn() {
    if (mobileSidebar) mobileSidebar.classList.remove('open');
    if (mobileOverlay) mobileOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebar);
  if (closeSidebar) closeSidebar.addEventListener('click', closeSidebarFn);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeSidebarFn);

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      closeSidebarFn();
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.module-card, .notif-card, .pending-item');
    if (card) {
      card.style.transform = 'scale(0.97)';
      setTimeout(() => { card.style.transform = ''; }, 150);
    }
  });


  /* ---------- INIT ---------- */
  async function initDashboard() {
    if (window.Auth && window.Auth.guard) {
      await window.Auth.guard();
    }
    await fetchLiveMetrics();
    renderNotifications();
    renderModules();
    renderPendingActions();
    updateNavBadge();
  }

  setTimeout(initDashboard, 50);

})();
