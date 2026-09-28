// Los estilos base van PRIMERO: en CSS, a igual especificidad gana lo que se carga
// despues, y los estilos de cada componente tienen que poder pisar a los de la base.
import './estilos/tokens.css'
import './estilos/base.css'
import './estilos/compartidos.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { AuthProvider } from '@/auth/AuthContext'
import App from './App'

// aplicar el tema guardado antes del primer pintado para que no "parpadee"
try {
  document.documentElement.dataset.tema = localStorage.getItem('agp-tema') || 'oscuro'
} catch {
  document.documentElement.dataset.tema = 'oscuro'
}

const clienteQuery = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // no reintentar errores que no se arreglan solos (permiso, no existe...)
      retry: (intentos, error) => !(error instanceof ErrorApi && error.status >= 400 && error.status < 500) && intentos < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteQuery}>
      <BrowserRouter>
        <AuthProvider>
          <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
          <App />
          <Toaster position="bottom-right" theme="system" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--fuente)' } }} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
