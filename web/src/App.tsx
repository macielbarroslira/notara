import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Carregando } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/dados";
import { AlteracaoDetalhe } from "./pages/AlteracaoDetalhe";
import { Alteracoes } from "./pages/Alteracoes";
import { Configuracoes } from "./pages/Configuracoes";
import { Login } from "./pages/Login";
import { MonitorDetalhe } from "./pages/MonitorDetalhe";
import { MonitorForm } from "./pages/MonitorForm";
import { Monitores } from "./pages/Monitores";

function Protegido({ children }: { children: ReactNode }) {
  const { user, carregando } = useAuth();
  if (carregando) return <Carregando />;
  return user ? children : <Login />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <Protegido>
                <Layout />
              </Protegido>
            }
          >
            <Route index element={<Monitores />} />
            <Route path="monitores/novo" element={<MonitorForm />} />
            <Route path="monitores/:id" element={<MonitorDetalhe />} />
            <Route path="monitores/:id/editar" element={<MonitorForm key="editar" />} />
            <Route path="alteracoes" element={<Alteracoes />} />
            <Route path="alteracoes/:id" element={<AlteracaoDetalhe />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
