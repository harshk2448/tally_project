import React from "react";
import { Card } from "@/components/ui/Card";
import { DashboardStats } from "@/types/document";
import {
  FileText,
  CalendarCheck,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Percent,
} from "lucide-react";

interface StatsCardsProps {
  stats: DashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Documents",
      value: stats.totalDocuments,
      subtitle: "All uploaded & processed",
      icon: FileText,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
      border: "border-sky-500/20",
      glow: "cyan" as const,
    },
    {
      title: "Documents Today",
      value: stats.documentsToday,
      subtitle: "Processed in current cycle",
      icon: CalendarCheck,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      glow: "indigo" as const,
    },
    {
      title: "Successful OCR",
      value: stats.successfulOcr,
      subtitle: `${stats.successRate}% pipeline success rate`,
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      glow: "emerald" as const,
    },
    {
      title: "Failed / Needs Review",
      value: stats.failedOcr,
      subtitle: "Flagged by AI Cleaner",
      icon: AlertTriangle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      glow: "none" as const,
    },
    {
      title: "Average Confidence",
      value: `${stats.averageConfidence}%`,
      subtitle: "Field extraction accuracy",
      icon: Percent,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      glow: "none" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            glow={card.glow}
            className="p-5 border-slate-800/80 hover:bg-slate-900/80 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{card.title}</span>
              <div
                className={`w-8 h-8 rounded-lg ${card.bg} border ${card.border} flex items-center justify-center`}
              >
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-slate-100 tracking-tight">
                {card.value}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">{card.subtitle}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
