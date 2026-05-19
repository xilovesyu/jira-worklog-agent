import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryProvider, useQueryClient } from './lib/QueryProvider'
import LogPage from './pages/LogPage'
import HistoryPage from './pages/HistoryPage'

function NavigationHandler() {
  const location = useLocation()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Cancel queries for inactive tab when navigating
    if (location.pathname === '/history') {
      // Cancel LogPage queries
      queryClient.cancelQueries({ queryKey: ['tickets'] })
      queryClient.cancelQueries({ queryKey: ['worklog'] })
      queryClient.cancelQueries({ queryKey: ['submittedTickets'] })
    } else {
      // Cancel HistoryPage queries
      queryClient.cancelQueries({ queryKey: ['worklogHistory'] })
    }
  }, [location.pathname, queryClient])

  return null
}

function App() {
  return (
    <QueryProvider>
      <HashRouter>
        <NavigationHandler />
        <div className="container">
          <nav className="nav-bar">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              ⏰ 记录时间
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              📅 历史记录
            </NavLink>
          </nav>

          <main className="main-content">
            <Routes>
              <Route path="/" element={<LogPage />} />
              <Route path="/history" element={<HistoryPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </QueryProvider>
  )
}

export default App