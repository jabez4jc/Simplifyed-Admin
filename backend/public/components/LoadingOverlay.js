import Component from './Component.js';

/**
 * Loading Overlay Component
 */
class LoadingOverlay extends Component {
  render() {
    return `
      <div class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center">
        <div class="text-center">
          <div class="animate-spin w-12 h-12 mx-auto mb-4">
            <i data-lucide="loader-2" class="w-12 h-12 text-blue-400"></i>
          </div>
          <p class="text-white text-lg">Loading Simplifyed Dashboard...</p>
        </div>
      </div>
    `;
  }

  show() {
    const overlay = this.element?.querySelector('div');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  hide() {
    const overlay = this.element?.querySelector('div');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
}

export default LoadingOverlay;
