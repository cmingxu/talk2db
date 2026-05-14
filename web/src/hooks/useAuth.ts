import { useState, useEffect } from "react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userID: number | null;
  role: string | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    userID: null,
    role: null,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/me");
        if (response.ok) {
          const data = await response.json();
          setState({
            isAuthenticated: true,
            isLoading: false,
            userID: data.userID,
            role: data.role,
          });
        } else {
          setState({ isAuthenticated: false, isLoading: false, userID: null, role: null });
        }
      } catch {
        setState({ isAuthenticated: false, isLoading: false, userID: null, role: null });
      }
    };

    checkAuth();
  }, []);

  return state;
}
