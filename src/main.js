import { App } from './core/app.js';
import { setupOverlay } from './overlay.js';
import { createGame } from './game/game.js';

const app = new App(document.getElementById('app'), { mouth: createGame });
setupOverlay(app);
app.goTo('mouth');

window.fdcApp = app; // handy in the browser console
