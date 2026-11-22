'use strict';
const { ipcRenderer } = require('electron');

function safeImageSrc(value) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return null;
}

function initials(name) {
  const clean = String(name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}

function createAvatar(person, sizeClass) {
  const wrap = document.createElement('span');
  wrap.className = 'ov-avatar ' + sizeClass;
  if (person.speaking) wrap.classList.add('speaking');
  const src = safeImageSrc(person.avatarUrl);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      wrap.textContent = initials(person.name);
    });
    wrap.appendChild(img);
  } else {
    wrap.textContent = initials(person.name);
  }
  return wrap;
}

function createMicSlashIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ov-muted-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-5.12-2.12M9 9v2a3 3 0 0 0 3 3m7-3a7 7 0 0 1-1.64 4.5M5 11a7 7 0 0 0 10.5 6.06M12 18v3m-4 0h8M3 3l18 18',
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.1');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function createEyeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ov-eye-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(path);
  svg.appendChild(circle);
  return svg;
}

function renderOverlay(payload) {
  const root = document.getElementById('overlayRoot');
  if (!root || !payload || typeof payload !== 'object') return;
  const corner = typeof payload.corner === 'string' ? payload.corner : 'top-left';
  const opacity = Number.isFinite(payload.opacity)
    ? Math.max(0.35, Math.min(1, payload.opacity))
    : 0.9;
  root.dataset.corner = corner;
  root.style.opacity = String(opacity);

  const frag = document.createDocumentFragment();
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const watchers = Array.isArray(payload.watchers) ? payload.watchers : [];
  const toasts = Array.isArray(payload.toasts) ? payload.toasts : [];

  if (payload.inCall && participants.length > 0) {
    const voiceList = document.createElement('div');
    voiceList.className = 'ov-voice-list';
    for (const person of participants.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'ov-voice-row';
      if (person.speaking) row.classList.add('speaking');
      row.appendChild(createAvatar(person, 'ov-avatar-sm'));
      const label = document.createElement('span');
      label.className = 'ov-voice-name';
      label.textContent = String(person.name || '').slice(0, 18);
      row.appendChild(label);
      if (person.muted || person.deafened) {
        row.appendChild(createMicSlashIcon());
      }
      voiceList.appendChild(row);
    }
    frag.appendChild(voiceList);
  }

  if (payload.sharingScreen && watchers.length > 0) {
    const livePill = document.createElement('div');
    livePill.className = 'ov-watchers-pill';
    livePill.appendChild(createEyeIcon());
    const count = document.createElement('span');
    count.className = 'ov-watchers-count';
    count.textContent = String(watchers.length);
    livePill.appendChild(count);
    const avatars = document.createElement('div');
    avatars.className = 'ov-watcher-avatars';
    for (const watcher of watchers.slice(0, 4)) {
      avatars.appendChild(createAvatar(watcher, 'ov-avatar-xs'));
    }
    livePill.appendChild(avatars);
    const names = document.createElement('span');
    names.className = 'ov-watcher-names';
    const previewNames = watchers
      .slice(0, 2)
      .map((w) => String(w.name || '').slice(0, 12))
      .join(', ');
    names.textContent =
      watchers.length > 2 ? `${previewNames} +${watchers.length - 2}` : previewNames;
    livePill.appendChild(names);
    frag.appendChild(livePill);
  }

  if (toasts.length > 0) {
    const toastList = document.createElement('div');
    toastList.className = 'ov-toast-list';
    for (const toast of toasts.slice(0, 3)) {
      const card = document.createElement('div');
      card.className = 'ov-toast';
      if (toast.fading) card.classList.add('fading');
      const header = document.createElement('div');
      header.className = 'ov-toast-title';
      header.textContent = String(toast.title || '').slice(0, 64);
      card.appendChild(header);
      if (toast.body) {
        const body = document.createElement('div');
        body.className = 'ov-toast-body';
        body.textContent = String(toast.body).slice(0, 120);
        card.appendChild(body);
      }
      const imgSrc = safeImageSrc(toast.imageUrl);
      if (imgSrc) {
        const img = document.createElement('img');
        img.className = 'ov-toast-image';
        img.src = imgSrc;
        img.alt = '';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove());
        card.appendChild(img);
      }
      toastList.appendChild(card);
    }
    frag.appendChild(toastList);
  }

  root.replaceChildren(frag);
}

let pendingPayload = null;
ipcRenderer.on('mn:overlay-render', (_event, payload) => {
  pendingPayload = payload;
  if (document.readyState !== 'loading') renderOverlay(payload);
});
window.addEventListener('DOMContentLoaded', () => {
  if (pendingPayload) renderOverlay(pendingPayload);
});
