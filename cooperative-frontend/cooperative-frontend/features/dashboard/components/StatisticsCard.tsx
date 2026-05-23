'use client';

interface Props {
  label: string;
  value: string;
  /** Tailwind gradient classes e.g. "from-blue-500 to-cyan-500" */
  gradient?: string;
  icon?: React.ReactNode;
}

export function StatisticsCard({ label, value, gradient = 'from-blue-500 to-cyan-500', icon }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
      <div className="relative p-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        {icon && (
          <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient} text-white opacity-80`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
