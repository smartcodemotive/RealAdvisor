import { Navigate, Route, Routes, Link, useNavigate } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PropertiesPage } from "./pages/PropertiesPage";

const isAuthed = () => Boolean(localStorage.getItem("token"));

function Protected({ children }: { children: JSX.Element }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

function Layout({ children }: { children: JSX.Element }) {
  const navigate = useNavigate();
  return (
    <div className="layout">
      <header className="topbar">
        <h1>RealAdvisor Agent Dashboard</h1>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/properties">Properties</Link>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              navigate("/login");
            }}
          >
            Logout
          </button>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout>
              <DashboardPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/properties"
        element={
          <Protected>
            <Layout>
              <PropertiesPage />
            </Layout>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
