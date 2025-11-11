import Component from './Component.js';

/**
 * Base Modal Component
 */
class Modal extends Component {
  constructor(props) {
    super(props);
    this.title = props.title || '';
    this.size = props.size || 'md'; // sm, md, lg, xl
    this.closable = props.closable !== false;
  }

  render() {
    return `
      <div class="modal fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[60] items-center justify-center ${this.isOpen() ? 'active' : ''}">
        <div class="max-w-${this.getSizeClass()} w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl mx-4 max-h-[80vh] overflow-y-auto">
          ${this.renderHeader()}
          <div class="modal-content">
            ${this.props.content || ''}
          </div>
          ${this.renderFooter()}
        </div>
      </div>
    `;
  }

  renderHeader() {
    if (!this.title && !this.closable) return '';

    return `
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-white">${this.title}</h2>
        ${this.closable ? `
          <button onclick="this.closest('.modal').classList.remove('active')" class="text-slate-400 hover:text-white">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        ` : ''}
      </div>
    `;
  }

  renderFooter() {
    return this.props.footer || '';
  }

  getSizeClass() {
    const sizes = {
      sm: 'md',
      md: '2xl',
      lg: '4xl',
      xl: '6xl'
    };
    return sizes[this.size] || sizes.md;
  }

  isOpen() {
    const modal = this.element?.querySelector('.modal');
    return modal?.classList.contains('active') || false;
  }

  open() {
    const modal = this.element?.querySelector('.modal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  close() {
    const modal = this.element?.querySelector('.modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }
}

export default Modal;
