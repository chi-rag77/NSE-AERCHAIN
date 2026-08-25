import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const FullScreen = ({ children }: { children: ReactNode }) => (
  <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
    {children}
  </div>
);

/** Requires a logged-in user — or auth disabled (demo mode), or public mode
 *  (Dashboard/Tickets are deliberately open to anonymous visitors). */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, authDisabled, publicMode } = useAuth();
  const location = useLocation();

  if (authDisabled || publicMode) return <>{children}</>;
  if (loading) return <FullScreen>Loading…</FullScreen>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};

/** Requires a logged-in admin. Deliberately does NOT honor publicMode — an
 *  anonymous visitor never gets Reports or Admin, only a real admin login
 *  does, even while Dashboard/Tickets are open to the public. */
export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { session, isAdmin, loading, authDisabled } = useAuth();
  const location = useLocation();

  if (authDisabled) return <>{children}</>;
  if (loading) return <FullScreen>Loading…</FullScreen>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};
