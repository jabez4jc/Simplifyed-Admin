import Component from './Component.js';

/**
 * Toast Notification Container Component
 */
class ToastContainer extends Component {
  render() {
    return `
      <div class="fixed top-4 right-4 z-50 space-y-2" id="toast-container" role="alert" aria-live="polite" aria-atomic="true">
        <!-- Toasts will be appended here -->
      </div>
    `;
  }

  showToast(message, type = 'info', duration = 5000) {
    const toast = this.createToastElement(message, type);
    const container = this.element.querySelector('#toast-container');
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(toast);
      }, duration);
    }

    return toast;
  }

  createToastElement(message, type) {
    const icon = this.getIconForType(type);
    const colorClass = this.getColorClassForType(type);

    const toast = document.createElement('div');
    toast.className = `toast ${colorClass} transform translate-x-full opacity-0 transition-all duration-300 ease-in-out`;
    toast.innerHTML = `
      <div class="flex items-start space-x-3 p-4 rounded-lg shadow-lg bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 min-w-[300px]">
        <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
        <div class="flex-1">
          <p class="text-white text-sm font-medium">${message}</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white transition-colors">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    `;

    // Re-initialize Lucide icons for the toast
    if (window.lucide) {
      window.lucide.createIcons();
    }

    return toast;
  }

  getIconForType(type) {
    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      warning: 'alert-triangle',
      info: 'info'
    };
    return icons[type] || icons.info;
  }

  getColorClassForType(type) {
    const classes = {
      success: 'text-profit',
      error: 'text-loss',
      warning: 'text-warning',
      info: 'text-info'
    };
    return classes[type] || classes.info;
  }

  removeToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 300);
  }
}

export default ToastContainer;
