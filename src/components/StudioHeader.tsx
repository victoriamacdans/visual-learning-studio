import { RotateCcw } from 'lucide-react';
import { APP_CONFIG, type StudyModuleId } from '../config/appConfig';
import { STUDY_MODULES } from '../data/jetPropulsionContent';

interface StudioHeaderProps {
  activeModuleId: StudyModuleId;
  onSelectModule: (moduleId: StudyModuleId) => void;
  onResetLayout: () => void;
}

/**
 * Single-row studio navigation bar following a strict three-zone layout:
 * Brand title — Curriculum module links — Reset workspace action.
 */
export function StudioHeader({
  activeModuleId,
  onSelectModule,
  onResetLayout,
}: StudioHeaderProps) {
  return (
    <header className="h-14 shrink-0 border-b border-slate-800 bg-[#0B0F18] px-4 lg:px-6 flex items-center justify-between gap-8">
      {/* Zone 1: Single-element wordmark */}
      <span className="font-display text-base lg:text-lg font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
        {APP_CONFIG.appName}
      </span>

      {/* Zone 2: Single-line curriculum module links */}
      <nav
        aria-label="Curriculum modules"
        className="hidden lg:flex items-center gap-6 text-sm font-medium"
      >
        {STUDY_MODULES.map((mod) => {
          const isActive = mod.id === activeModuleId;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => onSelectModule(mod.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-sm ${
                isActive
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {mod.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-cyan-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary workspace action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onResetLayout}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded-md hover:bg-slate-800 hover:border-slate-600 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          Reset Layout
        </button>
      </div>
    </header>
  );
}
