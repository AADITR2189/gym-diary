import { NavLink } from 'react-router-dom';
import { House, CalendarBlank, Plus, ChartLineUp, ListBullets } from '@phosphor-icons/react';

const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors';

export default function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => `${item} ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;
  return (
    <nav className="bar bar-bottom fixed inset-x-0 bottom-0 z-40 pb-safe" aria-label="Main">
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-2">
        <NavLink to="/" end className={cls}>
          {({ isActive }) => (
            <>
              <House size={22} weight={isActive ? 'fill' : 'bold'} />
              Today
            </>
          )}
        </NavLink>
        <NavLink to="/calendar" className={cls}>
          {({ isActive }) => (
            <>
              <CalendarBlank size={22} weight={isActive ? 'fill' : 'bold'} />
              Calendar
            </>
          )}
        </NavLink>
        <NavLink to="/log" className={({ isActive }) => `${item} ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {({ isActive }) => (
            <>
              <span className={`grid h-8 w-12 place-items-center rounded-full bg-primary text-primary-ink ${isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : ''}`}>
                <Plus size={20} weight="bold" />
              </span>
              Log
            </>
          )}
        </NavLink>
        <NavLink to="/history" className={cls}>
          {({ isActive }) => (
            <>
              <ListBullets size={22} weight={isActive ? 'fill' : 'bold'} />
              History
            </>
          )}
        </NavLink>
        <NavLink to="/progress" className={cls}>
          {({ isActive }) => (
            <>
              <ChartLineUp size={22} weight={isActive ? 'fill' : 'bold'} />
              Progress
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}
