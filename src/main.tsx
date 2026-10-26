import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const view = window.location.pathname === '/telegram/random'
  ? import('./components/TelegramRandomForm.tsx')
  : import('./App.tsx');

void view.then(({default: View}) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <View />
    </StrictMode>,
  );
});
