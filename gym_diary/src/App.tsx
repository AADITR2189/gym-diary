import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { IconContext } from '@phosphor-icons/react';
import { DataProvider } from './hooks/useData';
import BottomNav from './components/BottomNav';
import DialogHost from './components/DialogHost';
import { primeSound } from './lib/feedback';
import Dashboard from './pages/Dashboard';
import LogHub from './pages/LogHub';
import Editor from './pages/Editor';
import CalendarPage from './pages/CalendarPage';
import History from './pages/History';
import Progress from './pages/Progress';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import GoalsPage from './pages/GoalsPage';
import ExercisesPage from './pages/ExercisesPage';
import WaterPage from './pages/WaterPage';
import TemplatesPage from './pages/TemplatesPage';
import WorkoutDetails from './pages/WorkoutDetails';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

/** Start a fresh editor whenever its link changes (e.g. "Continue to cardio" after saving a workout). */
function EditorRoute() {
  const { search } = useLocation();
  return <Editor key={search} />;
}

// HashRouter keeps routing working on any static host (GitHub Pages etc.) and offline.
export default function App() {
  // Browsers only allow sound after a tap: unlock it on the first touch so timers can beep later.
  useEffect(() => {
    const unlock = () => primeSound();
    window.addEventListener('pointerdown', unlock, { passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  return (
    <IconContext.Provider value={{ weight: 'bold', size: 20 }}>
      <DataProvider>
        <HashRouter>
          <ScrollTop />
          <main className="mx-auto min-h-screen max-w-lg px-4 pb-28 pt-safe md:max-w-3xl lg:max-w-5xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log" element={<LogHub />} />
              <Route path="/log/edit" element={<EditorRoute />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/session" element={<WorkoutDetails />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/history" element={<History />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/exercises" element={<ExercisesPage />} />
              <Route path="/water" element={<WaterPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </main>
          <BottomNav />
          <DialogHost />
        </HashRouter>
      </DataProvider>
    </IconContext.Provider>
  );
}
