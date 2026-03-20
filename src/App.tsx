import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

function App() {
  const [user, setUser] = useState<string | null>(null);

  // Auto-login if previously logged in (optional, but good for UX)
  useEffect(() => {
    const savedUser = localStorage.getItem('efigas_user');
    if (savedUser) setUser(savedUser);
  }, []);

  const handleLogin = (username: string) => {
    setUser(username);
    localStorage.setItem('efigas_user', username);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('efigas_user');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      <Dashboard onLogout={handleLogout} />
    </div>
  )
}

export default App
