import React from "react";
import { Search } from "lucide-react";

export const TableContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div
    className={`w-full overflow-x-auto rounded-2xl glass-panel border border-white/80 shadow-md ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <table className={`w-full text-left border-collapse ${className}`} {...props}>
    {children}
  </table>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <thead
    className={`bg-white/80 backdrop-blur-md text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200/80 ${className}`}
    {...props}
  >
    {children}
  </thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <tbody className={`divide-y divide-slate-200/60 text-sm font-medium ${className}`} {...props}>
    {children}
  </tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <tr className={`hover:bg-blue-50/40 transition-colors ${className}`} {...props}>
    {children}
  </tr>
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <th className={`px-4 py-3.5 text-slate-700 ${className}`} {...props}>
    {children}
  </th>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <td className={`px-4 py-3.5 text-slate-800 ${className}`} {...props}>
    {children}
  </td>
);

export const TableFilterRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <tr className={`bg-slate-50/70 border-b border-slate-200/80 ${className}`} {...props}>
    {children}
  </tr>
);

export const TableFilterCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <th className={`px-4 py-2 font-normal ${className}`} {...props}>
    {children}
  </th>
);

export const TableFilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = "",
  ...props
}) => (
  <div className="relative flex items-center w-full">
    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
    <input
      type="text"
      className={`w-full h-8 pl-8 pr-2.5 text-xs font-medium rounded-lg bg-white/70 border border-slate-200/80 text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors ${className}`}
      {...props}
    />
  </div>
);

export const TableFilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = "",
  children,
  ...props
}) => (
  <select
    className={`w-full h-8 px-2 text-xs font-medium rounded-lg bg-white/70 border border-slate-200/80 text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors cursor-pointer ${className}`}
    {...props}
  >
    {children}
  </select>
);
