'use strict';
(function (root) {
  const finite = (n) => typeof n === 'number' && Number.isFinite(n),
    positive = (n) => (finite(n) ? Math.max(0, n) : null);
  // Targets are requests to WebRTC, not measured end-to-end latency. Leave
  // stream/game audio and video alone; never reconnect or replace a voice track.
  class VoiceReception {
    constructor(enabled = true) {
      this.enabled = enabled;
      this.receivers = new Map();
    }
    add(receiver) {
      if (!receiver || receiver.track?.kind !== 'audio') return null;
      let row = this.receivers.get(receiver);
      if (row) return row;
      row = {
        receiver,
        original: null,
        supported: false,
        targetMs: 60,
        lastChange: -Infinity,
        goodSince: null,
        previous: null,
        metrics: null,
      };
      try {
        if ('jitterBufferTarget' in receiver) {
          row.original = receiver.jitterBufferTarget;
          row.supported = true;
        }
      } catch {}
      this.receivers.set(receiver, row);
      this.apply(row, this.enabled ? 60 : row.original);
      return row;
    }
    apply(row, target) {
      if (!row.supported) return;
      try {
        row.receiver.jitterBufferTarget = target;
        if (row.receiver.jitterBufferTarget !== target) throw Error('Target not supported');
        row.targetMs = target;
      } catch {
        row.supported = false;
        try {
          row.receiver.jitterBufferTarget = row.original;
        } catch {}
      }
    }
    configure(enabled) {
      this.enabled = enabled;
      for (const row of this.receivers.values()) {
        row.goodSince = null;
        row.lastChange = -Infinity;
        this.apply(row, enabled ? 60 : row.original);
      }
    }
    remove(receiver) {
      const row = this.receivers.get(receiver);
      if (!row) return;
      this.apply(row, row.original);
      this.receivers.delete(receiver);
    }
    clear() {
      for (const receiver of this.receivers.keys()) this.remove(receiver);
    }
    prune(live) {
      for (const receiver of this.receivers.keys())
        if (!live.has(receiver) || receiver.track?.readyState === 'ended') this.remove(receiver);
    }
    sample(receiver, stat, stamp) {
      const row = this.add(receiver);
      if (!row) return null;
      const next = {
        received: positive(stat.packetsReceived),
        lost: positive(stat.packetsLost),
        samples: positive(stat.totalSamplesReceived),
        concealed: positive(stat.concealedSamples),
        delay: positive(stat.jitterBufferDelay),
        emitted: positive(stat.jitterBufferEmittedCount),
        stamp,
      };
      const prev = row.previous;
      row.previous = next;
      // Missing/restarted counters are not a healthy interval. The first sample
      // establishes a baseline, so lifetime averages never hide a new dropout.
      if (
        !prev ||
        stamp <= prev.stamp ||
        ['received', 'samples', 'emitted'].some(
          (k) => next[k] !== null && prev[k] !== null && next[k] < prev[k],
        )
      ) {
        row.metrics = null;
        return null;
      }
      const delta = (k) =>
        next[k] !== null && prev[k] !== null ? Math.max(0, next[k] - prev[k]) : null;
      const received = delta('received'),
        lost = delta('lost'),
        samples = delta('samples'),
        concealed = delta('concealed'),
        emitted = delta('emitted'),
        delay = delta('delay');
      const lossPct =
        received !== null && lost !== null && received + lost > 0
          ? (lost / (received + lost)) * 100
          : null;
      const concealedPct =
        samples > 0 && concealed !== null ? Math.min(100, (concealed / samples) * 100) : null;
      const jitterMs = positive(stat.jitter) === null ? null : stat.jitter * 1000;
      row.metrics = {
        lossPct,
        jitterMs,
        concealedPct,
        bufferMs: emitted > 0 && delay !== null ? (delay / emitted) * 1000 : null,
        packets: received,
      };
      if (this.enabled && row.supported && received > 0) {
        // A little more receive margin can help variable arrivals. Pure packet
        // loss or a delayed UI timer alone do not justify accumulating latency.
        const poor = jitterMs >= 30 || concealedPct >= 3;
        if (poor) {
          row.goodSince = null;
          if (stamp - row.lastChange >= 10000 && row.targetMs < 140) {
            this.apply(row, Math.min(140, row.targetMs + 40));
            row.lastChange = stamp;
          }
        } else if (
          lossPct !== null &&
          lossPct < 2 &&
          concealedPct !== null &&
          concealedPct < 1 &&
          jitterMs !== null &&
          jitterMs < 20
        ) {
          if (row.goodSince === null) row.goodSince = stamp;
          if (stamp - row.goodSince >= 60000 && row.targetMs > 60) {
            this.apply(row, Math.max(60, row.targetMs - 40));
            row.lastChange = stamp;
            row.goodSince = stamp;
          }
        } else row.goodSince = null;
      }
      return this.summary(row);
    }
    summary(row) {
      return {
        ...row.metrics,
        supported: row.supported,
        targetMs: this.enabled && row.supported ? row.targetMs : null,
      };
    }
    snapshot() {
      return [...this.receivers.values()]
        .filter((r) => r.metrics)
        .map((r, i) => ({ voice: i + 1, ...this.summary(r) }));
    }
  }
  function assessment(rows, lagMs, playout) {
    const arrivals = rows.some((r) => r.lossPct >= 2 || r.jitterMs >= 30),
      rebuilt = rows.some((r) => r.concealedPct >= 3),
      late = lagMs >= 120;
    if (playout?.gapEvents > 0)
      return {
        kind: 'output',
        text: 'A saída de áudio precisou preencher lacunas. Verifique carga local e dispositivo; a leitura não identifica um driver específico.',
      };
    if (arrivals)
      return {
        kind: 'arrival',
        text: 'Há perda ou variação na chegada da voz. A origem pode ser rede ou o computador de quem fala.',
      };
    if (rebuilt && late)
      return {
        kind: 'local',
        text: 'Voz reconstruída e atraso local ocorreram juntos. Há indício de sobrecarga, sem confirmação da causa.',
      };
    if (rebuilt)
      return {
        kind: 'recovery',
        text: 'O receptor reconstruiu parte da voz. Compare este intervalo com o jogo fechado e durante os cortes.',
      };
    if (late)
      return {
        kind: 'local-timing',
        text: 'A interface demorou a responder. Isso, sozinho, não confirma falha na reprodução da voz.',
      };
    return {
      kind: rows.length ? 'steady' : 'waiting',
      text: rows.length
        ? 'Sem irregularidade nos intervalos medidos. Isso não confirma som audível no dispositivo.'
        : 'Aguardando amostras de voz recebida.',
    };
  }
  const api = { VoiceReception, assessment };
  root.TronoVoiceReception = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
