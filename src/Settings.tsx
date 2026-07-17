import {
  LogOut,
  Moon,
  RefreshCw,
  Shield,
  Smartphone,
  Sun,
  TriangleAlert,
  User,
} from "lucide-react";
import { useState } from "react";

export default function Settings({
  onShowUnsafe,
  onSignOut,
  isUsingMock,
  lastSync,
}: {
  onShowUnsafe: () => void;
  onSignOut: () => void;
  isUsingMock: boolean;
  lastSync: Date | null;
}) {
  const [darkMode, setDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  );

  function toggleDark() {
    setDarkMode((p) => {
      const next = !p;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1 px-4 pt-4">
      {/* Profile */}
      <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 dark:bg-black">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-lg font-bold text-white shadow-sm">
          A
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 truncate dark:text-neutral-100">
            Alex Rivera
          </div>
          <div className="text-sm text-slate-400 truncate dark:text-neutral-500">
            alex@relay.app
          </div>
        </div>
      </div>

      {/* Sync status */}
      <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-3 dark:bg-black">
        <RefreshCw size={18} className={isUsingMock ? "text-slate-300 dark:text-neutral-600" : "text-green-500"} />
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-800 dark:text-neutral-200">
            {isUsingMock ? "Demo mode" : "Connected to Gmail"}
          </div>
          <div className="text-xs text-slate-400 dark:text-neutral-500">
            {isUsingMock
              ? "Sign in to load real emails"
              : lastSync
                ? `Last synced ${lastSync.toLocaleTimeString()}`
                : "Syncing..."}
          </div>
        </div>
      </div>

      {/* Unsafe emails */}
      <button
        type="button"
        onClick={onShowUnsafe}
        className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50 dark:bg-black dark:text-orange-400 dark:hover:bg-neutral-900"
      >
        <TriangleAlert size={20} />
        Unsafe emails
      </button>

      {/* Appearance */}
      <Section title="Appearance">
        <Row
          icon={darkMode ? Moon : Sun}
          label="Dark mode"
          control={
            <button
              type="button"
              onClick={toggleDark}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                darkMode ? "bg-blue-600" : "bg-slate-300 dark:bg-neutral-600"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  darkMode ? "translate-x-5" : ""
                }`}
              />
            </button>
          }
        />
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <Row
          icon={User}
          label="Blocked senders"
          control={
            <span className="text-xs font-medium text-slate-400 dark:text-neutral-500">
              None
            </span>
          }
        />
        <Row
          icon={Smartphone}
          label="Notifications"
          control={
            <span className="text-xs font-medium text-slate-400 dark:text-neutral-500">
              Off
            </span>
          }
        />
      </Section>

      {/* About */}
      <Section title="About">
        <Row
          icon={Shield}
          label="Version"
          control={
            <span className="text-xs font-medium text-slate-400 dark:text-neutral-500">
              1.0.0
            </span>
          }
        />
      </Section>

      {/* Sign Out */}
      <button
        type="button"
        onClick={onSignOut}
        className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-3.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-black dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <LogOut size={18} />
        Sign out
      </button>

      <p className="pb-8 pt-6 text-center text-[11px] font-medium tracking-wider text-slate-300 uppercase dark:text-neutral-700">
        Relay — better than gmail
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 mt-1 px-1 text-[11px] font-bold tracking-widest uppercase text-slate-400 dark:text-neutral-500">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl bg-white dark:bg-black">
        {children}
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  control,
}: {
  icon: React.ElementType;
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <Icon size={18} className="text-slate-400 dark:text-neutral-500" />
        <span className="text-sm font-medium text-slate-800 dark:text-neutral-200">
          {label}
        </span>
      </div>
      {control}
    </div>
  );
}
