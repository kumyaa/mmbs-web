import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home',     label: 'Home',     icon: '🏠' },
  { to: '/members',  label: 'Members',  icon: '👥' },
  { to: '/txns',     label: 'Txns',     icon: '💰' },
  { to: '/recon',    label: 'Recon',    icon: '🏦' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex safe-area-bottom z-40">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 ${
              isActive
                ? 'text-primary-500 font-semibold'
                : 'text-gray-500'
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
