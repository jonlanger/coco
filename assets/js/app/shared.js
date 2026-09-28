// Screens shared between field roles (driver + collector).
import { store, actions } from './store.js';
import { icon, esc, appbar, avatar, img, on } from './ui.js';

const WHO = {
  driver: { name: 'Stan · Driver', img: 'persona-driver.jpg' },
  collector: { name: 'Miguel · Collector', img: 'persona-collector.jpg' },
  dispatch: { name: 'Dispatch', img: null },
  customer: { name: 'Customer note', img: 'persona-customer.jpg' },
};

const QUICK = {
  driver: ['Pulling up now', 'Hold — traffic', 'Ready to roll', 'Need a hand at the arm'],
  collector: ['Clear — go', 'Hold on', 'Bin not out', 'Heavy load, need 2 min'],
};

export function messagesScreen(role) {
  return {
    tab: 'messages',
    render({ state }) {
      const msgs = state.messages;
      return `${appbar({ title: 'Crew channel', right: `<span class="chip chip--ok-soft">${icon('activity')}Live</span>` })}
      <div class="f-chat">
        <div class="f-chat__list" data-list>
          <p class="t-xs t-subtle" style="text-align:center">${esc(state.route.truck)} · ${esc(state.route.driver)} & ${esc(state.route.collector)} · Dispatch</p>
          ${msgs.map((m) => {
            const mine = m.from === role;
            const w = WHO[m.from] || WHO.dispatch;
            return `<div class="f-msg ${mine ? 'is-mine' : ''} ${m.from === 'dispatch' ? 'is-dispatch' : ''}">
              ${!mine ? (w.img ? avatar(img(w.img), w.name, 'sm') : `<span class="avatar avatar--sm" style="background:var(--primary);color:var(--primary-ink)">${icon('zap')}</span>`) : ''}
              <div><p class="t-xs t-subtle">${mine ? 'You' : w.name} · ${m.at}</p><p class="f-msg__bubble">${esc(m.text)}</p></div>
            </div>`;
          }).join('')}
        </div>
        <div class="f-chat__quick">${QUICK[role].map((q) => `<button class="btn btn--neutral btn--field" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="f-chat__compose" data-form>
          <button type="button" class="icon-btn icon-btn--lg" aria-label="Push to talk" data-ptt>${icon('mic')}</button>
          <input class="input" placeholder="Message crew" aria-label="Message" data-input>
          <button class="icon-btn icon-btn--lg icon-btn--brand" aria-label="Send">${icon('send')}</button>
        </form>
      </div>`;
    },
    mount(root) {
      const list = root.querySelector('[data-list]');
      list.scrollTop = list.scrollHeight;
      store.update((s) => { s.unread[role] = 0; }, { silent: true });
      on(root, '[data-q]', 'click', (e, b) => actions.sendMessage(role, b.dataset.q));
      on(root, '[data-ptt]', 'click', (e, b) => { b.classList.toggle('is-live'); });
      root.querySelector('[data-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const i = root.querySelector('[data-input]');
        if (i.value.trim()) actions.sendMessage(role, i.value.trim());
      });
    },
  };
}
