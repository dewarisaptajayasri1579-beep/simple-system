export interface DashboardNavBadge {
  label: string;
  href: string;
  count: number;
  color: "rose" | "amber" | "sky" | "violet" | "emerald" | "fuchsia" | "indigo";
}

const COLOR_CLASSES: Record<DashboardNavBadge["color"], string> = {
  rose: "bg-rose-500/10 text-rose-700 border-rose-500/30 hover:bg-rose-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20",
  sky: "bg-sky-500/10 text-sky-700 border-sky-500/30 hover:bg-sky-500/20",
  violet: "bg-violet-500/10 text-violet-700 border-violet-500/30 hover:bg-violet-500/20",
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 hover:bg-fuchsia-500/20",
  indigo: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 hover:bg-indigo-500/20",
};

const BADGE_COLOR_CLASSES: Record<DashboardNavBadge["color"], string> = {
  rose: "bg-rose-600 text-white",
  amber: "bg-amber-600 text-white",
  sky: "bg-sky-600 text-white",
  violet: "bg-violet-600 text-white",
  emerald: "bg-emerald-600 text-white",
  fuchsia: "bg-fuchsia-600 text-white",
  indigo: "bg-indigo-600 text-white",
};

export const DashboardNavBadges: React.FC<{ items: DashboardNavBadge[] }> = ({ items }) => {
  return (
    <div className="sticky top-20 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 glass-header">
      <div className="flex flex-wrap gap-2.5">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border backdrop-blur-md shadow-xs transition-colors ${COLOR_CLASSES[item.color]}`}
          >
            <span>{item.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${BADGE_COLOR_CLASSES[item.color]}`}>{item.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
};
