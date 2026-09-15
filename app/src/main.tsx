import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { PrefsProvider } from './store/prefs';
import { AuthProvider } from './data/auth';
import { capturePendingInviteFromUrl } from './data/pendingInvite';
import { UpdateProvider } from './app/UpdatePrompt';
import './styles/tokens.css';

capturePendingInviteFromUrl();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdateProvider>
      <QueryClientProvider client={queryClient}>
        <PrefsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </PrefsProvider>
      </QueryClientProvider>
    </UpdateProvider>
  </StrictMode>,
);
