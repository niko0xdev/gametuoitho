import React from 'react';
import { createRoot } from 'react-dom/client';
import TelegramRandomForm from '../src/components/TelegramRandomForm';
import '../src/index.css';

// The loopback simulator signs fixture data with its own non-production token.
void fetch('/__test/form-auth').then(r => r.json()).then(({ initData }) => {
  createRoot(document.getElementById('root')!).render(<TelegramRandomForm telegramApp={{ initData, ready() {}, expand() {}, close() { window.location.assign('/telegram-test'); } }} />);
});
