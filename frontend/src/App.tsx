import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { OperationsPage } from "./pages/OperationsPage";
import { OperationDetailPage } from "./pages/OperationDetailPage";
import { ContractsPage } from "./pages/ContractsPage";
import { ValidationPage } from "./pages/ValidationPage";
import { QuotationsPage } from "./pages/QuotationsPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { FiduciaryPage } from "./pages/FiduciaryPage";
import { LandingPage } from "./pages/LandingPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">
        Cargando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="empresas" element={<Navigate to="/app/clientes" replace />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/nuevo" element={<ClientDetailPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="facturas" element={<InvoicesPage />} />
        <Route path="cotizaciones" element={<QuotationsPage />} />
        <Route path="operaciones" element={<OperationsPage />} />
        <Route path="operaciones/:id" element={<OperationDetailPage />} />
        <Route path="contratos" element={<ContractsPage />} />
        <Route path="validacion" element={<ValidationPage />} />
        <Route path="fiduciario" element={<FiduciaryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
