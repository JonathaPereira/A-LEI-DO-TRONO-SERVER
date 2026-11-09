'use strict';

// Standalone Client for A Lei do Trono (MeN Games)
const suits = ['cetro', 'chave', 'lamina', 'mascara'];
const laws = {
  ordem: { name: 'Ordem', desc: 'Maior carta do naipe inicial leva a Coroa.' },
  estandarte: { name: 'Estandarte', desc: 'Trunfo definido pela Sombra anterior.' },
  revolta: { name: 'Revolta', desc: 'Menor carta do naipe inicial leva a Coroa.' },
  anarquia: { name: 'Anarquia', desc: 'Naipes ignorados; maior carta vence.' },
  usurpacao: { name: 'Usurpação', desc: 'A Sombra tem chance de roubar o trono.' }
};

let socket = null;
let currentHand = [];

function initMockHand() {
  const handEl = document.getElementById('playerHand');
  handEl.innerHTML = '';
  // Amostra de 6 cartas para prévia interativa
  const sampleCards = [
    { suit: 'cetro', value: 12 },
    { suit: 'cetro', value: 3 },
    { suit: 'chave', value: 11 },
    { suit: 'lamina', value: 10 },
    { suit: 'lamina', value: 1 },
    { suit: 'mascara', value: 7 }
  ];

  sampleCards.forEach(c => {
    const img = document.createElement('img');
    img.src = `../assets/cards/${c.suit}_${c.value}.webp`;
    img.alt = `${c.suit} ${c.value}`;
    img.className = 'card-thumb';
    img.title = `Naipe: ${c.suit.toUpperCase()} · Valor: ${c.value}`;
    img.addEventListener('click', () => playCard(c));
    handEl.appendChild(img);
  });
}

function playCard(card) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'play_card',
      suit: card.suit,
      value: card.value
    }));
  }
  document.getElementById('roundNotice').textContent = `Você jogou ${card.suit.toUpperCase()} ${card.value}`;
}

function setupConnection() {
  const form = document.getElementById('joinForm');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('serverUrl').value.trim();
    const room = document.getElementById('roomCode').value.trim();
    const name = document.getElementById('playerName').value.trim();

    if (socket) {
      socket.close();
    }

    statusText.textContent = 'Conectando…';
    statusDot.className = 'status-indicator';

    try {
      socket = new WebSocket(url);

      socket.onopen = () => {
        statusDot.className = 'status-indicator online';
        statusText.textContent = `Conectado (${room})`;
        socket.send(JSON.stringify({
          type: 'join_room',
          room: room,
          name: name
        }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (err) {
          console.warn('Mensagem não-JSON recebida:', event.data);
        }
      };

      socket.onclose = () => {
        statusDot.className = 'status-indicator';
        statusText.textContent = 'Desconectado';
      };

      socket.onerror = (err) => {
        statusDot.className = 'status-indicator';
        statusText.textContent = 'Erro de conexão';
      };
    } catch (err) {
      statusText.textContent = 'URL inválida';
    }
  });
}

function handleServerMessage(msg) {
  if (msg.law && laws[msg.law]) {
    document.getElementById('lawName').textContent = laws[msg.law].name;
  }
  if (msg.notice) {
    document.getElementById('roundNotice').textContent = msg.notice;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMockHand();
  setupConnection();
});
