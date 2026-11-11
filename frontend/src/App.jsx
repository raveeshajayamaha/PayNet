import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AppProvider } from "./context/AppContext";
import {
  PublicLayout,
  AuthLayout,
  DashboardLayout,
  AdminLayout,
} from "./layouts/Layouts";
import { ProtectedRoute, AdminRoute } from "./components/UI";
const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const NetworkDemo = import.meta.env.DEV
  ? lazy(() => import("./pages/NetworkDemo")) : null;
import {
  Dashboard,
  SendMoney,
  ReceiveMoney,
  Transactions,
  Notifications,
  Profile,
  Admin,
  NotFound,
} from "./pages/Workspace";
function RouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${pathname === "/" ? "Payments made simple" : pathname.slice(1).replaceAll("-", " ")} | PayNet`;
    if (hash) {
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
    } else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <RouteEffects />
        <Suspense
          fallback={
            <div className="empty" role="status">
              Loading PayNet...
            </div>
          }
        >
          <Routes>
            {import.meta.env.DEV && <Route path="network-demo" element={<NetworkDemo />} />}
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
            </Route>
            <Route element={<AuthLayout />}>
              <Route path="login" element={<Auth key="login" />} />
              <Route
                path="register"
                element={<Auth key="register" register />}
              />
            </Route>
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="send-money" element={<SendMoney />} />
              <Route path="receive-money" element={<ReceiveMoney />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppProvider>
    </BrowserRouter>
  );
}
