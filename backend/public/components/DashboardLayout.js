/**
 * DashboardLayout Component
 *
 * Main layout container that includes sidebar and content area.
 * Manages view switching and component lifecycle.
 */

import Component from './Component.js';
import NavigationSidebar from './NavigationSidebar.js';
import TopBar from './TopBar.js';
import store from '../lib/store.js';
import router from '../lib/router.js';

class DashboardLayout extends Component {
  constructor(props = {}) {
    super(props);

    this.state = {
      currentView: 'dashboard',
      sidebarCollapsed: false,
      loading: false
    };

    // Child components
    this.sidebar = null;
    this.topBar = null;
    this.currentViewComponent = null;

    // Subscribe to store changes
    this.unsubscribe = store.subscribe((newState) => {
      if (newState.currentView !== this.state.currentView) {
        this.setState({ currentView: newState.currentView });
      }
      if (newState.loading !== this.state.loading) {
        this.setState({ loading: newState.loading });
      }
    });
  }

  render() {
    const { currentView, sidebarCollapsed, loading } = this.state;

    return `
      <div class="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <!-- Sidebar -->
        <div id="sidebar-container" class="${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}">
          <!-- Sidebar component will be mounted here -->
        </div>

        <!-- Main Content Area -->
        <div id="main-container" class="transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}">
          <!-- TopBar -->
          <div id="topbar-container">
            <!-- TopBar component will be mounted here -->
          </div>

          <!-- Content -->
          <div id="content-container" class="p-6">
            ${loading ? `
              <div class="flex items-center justify-center h-64">
                <div class="text-center">
                  <div class="animate-spin w-12 h-12 mx-auto mb-4">
                    <i data-lucide="loader-2" class="w-12 h-12 text-blue-400"></i>
                  </div>
                  <p class="text-white text-lg">Loading...</p>
                </div>
              </div>
            ` : `
              <!-- View content will be mounted here -->
              <div id="view-container" class="view-${currentView}">
                <!-- Current view component -->
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  afterMount() {
    this.initializeChildComponents();
    this.attachEventListeners();
  }

  initializeChildComponents() {
    // Create and mount sidebar
    this.sidebar = new NavigationSidebar({
      currentView: this.state.currentView,
      onNavigate: (view) => this.handleNavigation(view),
      onToggleCollapse: (collapsed) => this.handleSidebarToggle(collapsed)
    });

    const sidebarContainer = this.element.querySelector('#sidebar-container');
    if (sidebarContainer) {
      sidebarContainer.innerHTML = '';
      const sidebarElement = document.createElement('div');
      sidebarContainer.appendChild(sidebarElement);
      sidebarElement.outerHTML = this.sidebar.render();
      this.sidebar.element = sidebarContainer.firstElementChild;
      this.sidebar.afterMount();
      this.sidebar.attachEventListeners();
    }

    // Create and mount topbar
    this.topBar = new TopBar({
      onSearch: (query) => this.handleSearch(query)
    });

    const topbarContainer = this.element.querySelector('#topbar-container');
    if (topbarContainer) {
      topbarContainer.innerHTML = '';
      const topbarElement = document.createElement('div');
      topbarContainer.appendChild(topbarElement);
      topbarElement.outerHTML = this.topBar.render();
      this.topBar.element = topbarContainer.firstElementChild;
      this.topBar.afterMount();
      this.topBar.attachEventListeners();
    }
  }

  attachEventListeners() {
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  handleNavigation(view) {
    // Update store
    store.setState({ currentView: view }, 'NAVIGATE');

    // Navigate with router
    router.navigate(`/${view}`);
  }

  handleSidebarToggle(collapsed) {
    this.setState({ sidebarCollapsed: collapsed });

    // Update store
    store.setState({ sidebarCollapsed: collapsed }, 'SIDEBAR_TOGGLE');
  }

  handleSearch(query) {
    // Emit search event to parent
    if (this.props.onSearch) {
      this.props.onSearch(query);
    }
  }

  /**
   * Load a view component into the content area
   */
  loadView(ViewComponent, props = {}) {
    const viewContainer = this.element.querySelector('#view-container');
    if (!viewContainer) return;

    // Destroy previous view component
    if (this.currentViewComponent) {
      this.currentViewComponent.destroy();
    }

    // Create and mount new view component
    this.currentViewComponent = new ViewComponent(props);
    viewContainer.innerHTML = '';
    const viewElement = document.createElement('div');
    viewContainer.appendChild(viewElement);
    viewElement.outerHTML = this.currentViewComponent.render();
    this.currentViewComponent.element = viewContainer.firstElementChild;
    this.currentViewComponent.afterMount();
    this.currentViewComponent.attachEventListeners();

    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    store.setState({ loading: true }, 'LOADING_START');
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    store.setState({ loading: false }, 'LOADING_END');
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.sidebar) {
      this.sidebar.destroy();
    }
    if (this.topBar) {
      this.topBar.destroy();
    }
    if (this.currentViewComponent) {
      this.currentViewComponent.destroy();
    }
    super.destroy();
  }
}

export default DashboardLayout;
