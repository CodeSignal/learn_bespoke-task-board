import { init } from './task-board.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init({}));
} else {
  init({});
}
