/**
 * Base Component Class
 * All UI components should extend this class
 */
class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.element = null;
    this.components = new Map();
  }

  /**
   * Render the component's HTML
   * Must be implemented by subclasses
   */
  render() {
    throw new Error('Component must implement render() method');
  }

  /**
   * Mount component to DOM
   */
  mount(selector) {
    this.element = document.querySelector(selector);
    if (!this.element) {
      throw new Error(`Element not found: ${selector}`);
    }

    this.element.innerHTML = this.render();
    this.afterMount();
    this.attachEventListeners();
  }

  /**
   * Update component state and re-render
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
    if (this.element) {
      this.element.innerHTML = this.render();
      this.attachEventListeners();
    }
  }

  /**
   * Called after component is mounted
   */
  afterMount() {
    // To be overridden by subclasses
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // To be overridden by subclasses
  }

  /**
   * Get child component instance
   */
  getComponent(name) {
    return this.components.get(name);
  }

  /**
   * Register child component
   */
  registerComponent(name, component) {
    this.components.set(name, component);
  }

  /**
   * Destroy component and cleanup
   */
  destroy() {
    this.components.forEach(component => {
      if (component.destroy) {
        component.destroy();
      }
    });
    this.components.clear();
  }
}

export default Component;
