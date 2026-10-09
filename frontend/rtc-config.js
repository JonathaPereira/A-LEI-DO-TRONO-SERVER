'use strict';
// Configuração WebRTC da Voz & Câmera da Corte.
// STUN cobre a maior parte das conexões domésticas. Para produção em redes
// restritivas, acrescente aqui um serviço TURN com credenciais próprias.
window.TRONO_RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ],
  iceCandidatePoolSize: 4
};
