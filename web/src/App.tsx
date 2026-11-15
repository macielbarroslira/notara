import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/dados";
import { AlteracaoDetalhe } from "./pages/AlteracaoDetalhe";
import { Assistente } from "./pages/Assistente";
import { Alteracoes } from "./pages/Alteracoes";
import { Configuracoes } from "./pages/Configuracoes";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { MonitorDetalhe } from "./pages/MonitorDetalhe";
import { MonitorForm } from "./pages/MonitorForm";
import { Concursos } from "./pages/Concursos";
import { ConcursoFicha } from "./pages/ConcursoFicha";
import { Monitores } from "./pages/Monitores";
import { Painel } from "./pages/Painel";

function Protegido({ children }: { children: ReactNode }) {
  const { user, carregando } = useAuth();
  const { pathname } = useLocation();
  if (carregando) return <Carregando />;
  if (user) return children;
  // Visitante: página inicial em "/", login nas demais (o link continua valendo depois de entrar)
  return pathname === "/" ? <Landing /> : <Login />;
}

function Entrar() {
  const { user, carregando } = useAuth();
  if (carregando) return <Carregando />;
  return user ? <Navigate to="/" replace /> : <Login />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="entrar" element={<Entrar />} />
          <Route
            element={
              <Protegido>
                <Layout />
              </Protegido>
            }
          >
            <Route index element={<Painel />} />
            <Route path="monitores" element={<Monitores />} />
            <Route path="concursos" element={<Concursos />} />
            <Route path="concursos/:id" element={<ConcursoFicha />} />
            <Route path="monitores/novo" element={<MonitorForm />} />
            <Route path="monitores/:id" element={<MonitorDetalhe />} />
            <Route path="monitores/:id/editar" element={<MonitorForm key="editar" />} />
            <Route path="alteracoes" element={<Alteracoes />} />
            <Route path="alteracoes/:id" element={<AlteracaoDetalhe />} />
            <Route path="assistente" element={<Assistente />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
