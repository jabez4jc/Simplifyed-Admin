import {
  Component,
  LoadingOverlay,
  LoginPage,
  NavigationSidebar,
  DashboardView,
  ToastContainer,
  Modal
} from './index.js';

/**
 * Component Factory for creating and managing UI components
 */
class ComponentFactory {
  constructor() {
    this.components = new Map();
  }

  /**
   * Create and register a component
   */
  create(name, ComponentClass, props = {}) {
    const component = new ComponentClass(props);
    this.components.set(name, component);
    return component;
  }

  /**
   * Get a registered component
   */
  get(name) {
    return this.components.get(name);
  }

  /**
   * Mount a component to a DOM selector
   */
  mount(name, selector) {
    const component = this.get(name);
    if (component) {
      component.mount(selector);
      return component;
    }
    throw new Error(`Component not found: ${name}`);
  }

  /**
   * Destroy a component
   */
  destroy(name) {
    const component = this.get(name);
    if (component) {
      component.destroy();
      this.components.delete(name);
    }
  }

  /**
   * Clear all components
   */
  clear() {
    this.components.forEach(component => {
      if (component.destroy) {
        component.destroy();
      }
    });
    this.components.clear();
  }

  /**
   * Initialize common UI components
   */
  initializeCommon() {
    // Create loading overlay
    this.create('loading', LoadingOverlay);
    this.mount('loading', '#loading');

    // Create toast container
    this.create('toast', ToastContainer);
    this.mount('toast', 'body');

    return this;
  }

  /**
   * Initialize authenticated components
   */
  initializeAuth(user) {
    // Create navigation sidebar
    this.create('sidebar', NavigationSidebar, { currentView: 'dashboard' });
    this.mount('sidebar', '#sidebar');

    // Create dashboard view
    this.create('dashboard', DashboardView, { instances: [], summary: {} });
    this.mount('dashboard', '#dashboard-content');

    return this;
  }

  /**
   * Update dashboard data
   */
  updateDashboard(instances, summary) {
    const dashboard = this.get('dashboard');
    if (dashboard) {
      dashboard.updateData(instances, summary);
    }
  }

  /**
   * Update sidebar active view
   */
  updateSidebarView(view) {
    const sidebar = this.get('sidebar');
    if (sidebar) {
      sidebar.updateActiveView(view);
    }
  }
}

export default new ComponentFactory();
