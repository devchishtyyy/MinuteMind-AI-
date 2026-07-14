import React, { useEffect, useRef, useState } from 'react';
import { Meeting } from '../types';
import { BarChart, PieChart, LineChart, TrendingUp, Users, CalendarDays, Clock, ShieldAlert, Award, Grid3X3, ArrowUpRight } from 'lucide-react';

interface StatChartsProps {
  meetings: Meeting[];
}

export default function StatCharts({ meetings }: StatChartsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'metrics' | 'accountability'>('metrics');
  const [accCompanyFilter, setAccCompanyFilter] = useState<'all' | 'Company Wide' | 'Corrugated' | 'Paper & Board'>('all');

  const barRef = useRef<HTMLCanvasElement | null>(null);
  const pieRef = useRef<HTMLCanvasElement | null>(null);
  const companyRef = useRef<HTMLCanvasElement | null>(null);
  const lineRef = useRef<HTMLCanvasElement | null>(null);
  const velocityRef = useRef<HTMLCanvasElement | null>(null);

  const barChartInstance = useRef<any>(null);
  const pieChartInstance = useRef<any>(null);
  const companyChartInstance = useRef<any>(null);
  const lineChartInstance = useRef<any>(null);
  const velocityChartInstance = useRef<any>(null);

  // === 1. METRICS CALCULATIONS ===
  const totalMeetings = meetings.length;
  const avgDuration = totalMeetings 
    ? Math.round(meetings.reduce((sum, m) => sum + (Number(m.duration) || 0), 0) / totalMeetings) 
    : 0;

  const totalDecisions = meetings.reduce((sum, m) => sum + (m.keyDecisions?.length || 0), 0);
  
  const pendingTasks = meetings.reduce((sum, m) => {
    const pending = m.actionItems?.filter(item => item.status === 'pending').length || 0;
    return sum + pending;
  }, 0);

  const attendeeCounts: { [key: string]: { count: number; role: string } } = {};
  meetings.forEach(m => {
    m.attendees?.forEach(a => {
      if (!a.name) return;
      const key = a.name.trim();
      if (attendeeCounts[key]) {
        attendeeCounts[key].count += 1;
      } else {
        attendeeCounts[key] = { count: 1, role: a.role || 'Attendee' };
      }
    });
  });

  const topAttendees = Object.entries(attendeeCounts)
    .map(([name, data]) => ({ name, role: data.role, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  meetings.forEach(m => {
    if (!m.date) return;
    const day = new Date(m.date).getDay();
    dayCounts[day] += 1;
  });

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let busiestDayIndex = 1;
  let maxDayCount = 0;
  dayCounts.forEach((count, idx) => {
    if (count > maxDayCount) {
      maxDayCount = count;
      busiestDayIndex = idx;
    }
  });
  const busiestDay = totalMeetings > 0 ? daysOfWeek[busiestDayIndex] : "None yet";

  const categoriesMap: { [key: string]: number } = { SOR: 0, POR: 0, MOR: 0 };
  meetings.forEach(m => {
    if (m.category && categoriesMap[m.category] !== undefined) {
      categoriesMap[m.category] += 1;
    }
  });

  const companyMap: { [key: string]: number } = {
    'Company Wide': 0,
    'Corrugated': 0,
    'Paper & Board': 0
  };
  meetings.forEach(m => {
    const comp = m.company || 'Company Wide';
    if (companyMap[comp] !== undefined) {
      companyMap[comp] += 1;
    }
  });

  const getWeeksData = () => {
    const weekLabels: string[] = [];
    const weekCounts: number[] = [];
    const today = new Date();
    
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i * 7);
      
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      weekLabels.push(label);

      const count = meetings.filter(m => {
        if (!m.date) return false;
        const mDate = new Date(m.date);
        return mDate >= weekStart && mDate <= weekEnd;
      }).length;
      
      weekCounts.push(count);
    }
    return { labels: weekLabels, counts: weekCounts };
  };

  const weeksData = getWeeksData();

  const getDurationTrendData = () => {
    const sortedMeetings = [...meetings]
      .filter(m => m.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);
    
    return {
      labels: sortedMeetings.map(m => m.title.substring(0, 12) + (m.title.length > 12 ? '...' : '')),
      durations: sortedMeetings.map(m => Number(m.duration) || 0)
    };
  };

  const trendData = getDurationTrendData();

  // === 2. ACCOUNTABILITY DASHBOARD CALCULATIONS ===
  const filteredAccMeetings = accCompanyFilter === 'all'
    ? meetings
    : meetings.filter(m => (m.company || 'Company Wide') === accCompanyFilter);

  // Get Last 8 MOR/SOR/POR Cycles sorted chronologically (ascending)
  const last8Cycles = [...filteredAccMeetings]
    .filter(m => m.category === 'SOR' || m.category === 'POR' || m.category === 'MOR')
    .sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime())
    .slice(-8);

  // Extract all unique individuals who have AT LEAST ONE action item across these 8 cycles
  const heatmapOwnersSet = new Set<string>();
  last8Cycles.forEach(m => {
    m.actionItems?.forEach(item => {
      if (item.owner) {
        heatmapOwnersSet.add(item.owner.trim());
      }
    });
  });
  const heatmapOwners = Array.from(heatmapOwnersSet).sort();

  // Helper to find completion rate of owner in a meeting
  const getOwnerCycleCompletion = (ownerName: string, meeting: Meeting) => {
    const ownerItems = meeting.actionItems?.filter(item => item.owner && item.owner.trim() === ownerName) || [];
    if (ownerItems.length === 0) return null; // Grey (no items)
    const completed = ownerItems.filter(item => item.status === 'done').length;
    return (completed / ownerItems.length) * 100;
  };

  // Bottlenecks calculation (lowest completed rates this month, with fallback)
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "2026-06"
  let monthlyAccMeetings = filteredAccMeetings.filter(m => m.date.startsWith(currentMonthStr));
  if (monthlyAccMeetings.length === 0) {
    monthlyAccMeetings = filteredAccMeetings; // Fallback
  }

  const ownerTotals: { [owner: string]: { total: number; completed: number } } = {};
  monthlyAccMeetings.forEach(m => {
    m.actionItems?.forEach(item => {
      if (!item.owner) return;
      const name = item.owner.trim();
      if (!ownerTotals[name]) {
        ownerTotals[name] = { total: 0, completed: 0 };
      }
      ownerTotals[name].total += 1;
      if (item.status === 'done') {
        ownerTotals[name].completed += 1;
      }
    });
  });

  const bottlenecksList = Object.entries(ownerTotals)
    .filter(([_, stats]) => stats.total > 0)
    .map(([owner, stats]) => {
      const rate = Math.round((stats.completed / stats.total) * 100);
      return {
        owner,
        total: stats.total,
        completed: stats.completed,
        rate,
        pending: stats.total - stats.completed
      };
    })
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, 3);

  // Velocity Trend line
  const velocityLabels = last8Cycles.map(m => `${m.category} (${m.date.substring(5)})`);
  const velocityData = last8Cycles.map(m => {
    const items = m.actionItems || [];
    if (items.length === 0) return 100;
    const done = items.filter(i => i.status === 'done').length;
    return Math.round((done / items.length) * 100);
  });

  // === 3. CHART EFFECT ===
  useEffect(() => {
    const Chart = (window as any).Chart;
    if (!Chart) {
      console.warn("Chart.js is not loaded from CDN.");
      return;
    }

    // Destroy existing instances
    if (barChartInstance.current) barChartInstance.current.destroy();
    if (pieChartInstance.current) pieChartInstance.current.destroy();
    if (companyChartInstance.current) companyChartInstance.current.destroy();
    if (lineChartInstance.current) lineChartInstance.current.destroy();
    if (velocityChartInstance.current) velocityChartInstance.current.destroy();

    if (activeSubTab === 'metrics') {
      // 1. Bar Chart: Meetings per week
      if (barRef.current) {
        const ctx = barRef.current.getContext('2d');
        if (ctx) {
          barChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: weeksData.labels,
              datasets: [{
                label: 'Meetings / Week',
                data: weeksData.counts,
                backgroundColor: '#6c63ff',
                hoverBackgroundColor: '#574feb',
                borderRadius: 6,
                borderWidth: 0,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#1a1d27',
                  titleColor: '#fff',
                  bodyColor: '#a1a1aa',
                  borderColor: '#374151',
                  borderWidth: 1,
                }
              },
              scales: {
                y: {
                  grid: { color: '#1f2937' },
                  ticks: { color: '#9ca3af', stepSize: 1 }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: '#9ca3af' }
                }
              }
            }
          });
        }
      }

      // 2. Pie Chart: Category breakdown
      if (pieRef.current) {
        const ctx = pieRef.current.getContext('2d');
        if (ctx) {
          const catLabels = Object.keys(categoriesMap).map(k => {
            if (k === 'SOR') return 'SOR — Short-term Operational Review';
            if (k === 'POR') return 'POR — Project Operational Review';
            if (k === 'MOR') return 'MOR — Monthly Operational Review';
            return k;
          });
          const catValues = Object.values(categoriesMap);

          pieChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: catLabels,
              datasets: [{
                data: catValues,
                backgroundColor: [
                  '#6c63ff', // SOR (purple)
                  '#f59e0b', // POR (amber)
                  '#22c55e', // MOR (green)
                ],
                borderColor: '#1a1d27',
                borderWidth: 2,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right',
                  labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } }
                },
                tooltip: {
                  backgroundColor: '#1a1d27',
                  borderColor: '#374151',
                  borderWidth: 1
                }
              },
              cutout: '65%'
            }
          });
        }
      }

      // 2.5 Pie Chart: Company breakdown
      if (companyRef.current) {
        const ctx = companyRef.current.getContext('2d');
        if (ctx) {
          const compLabels = Object.keys(companyMap);
          const compValues = Object.values(companyMap);

          companyChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: compLabels,
              datasets: [{
                data: compValues,
                backgroundColor: [
                  '#3b82f6', // Company Wide (blue)
                  '#ec4899', // Corrugated (pink)
                  '#06b6d4'  // Paper & Board (cyan)
                ],
                borderColor: '#1a1d27',
                borderWidth: 2,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right',
                  labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } }
                },
                tooltip: {
                  backgroundColor: '#1a1d27',
                  borderColor: '#374151',
                  borderWidth: 1
                }
              },
              cutout: '65%'
            }
          });
        }
      }

      // 3. Line Chart: Avg duration trend
      if (lineRef.current) {
        const ctx = lineRef.current.getContext('2d');
        if (ctx) {
          lineChartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
              labels: trendData.labels.length > 0 ? trendData.labels : ["No Data"],
              datasets: [{
                label: 'Duration (mins)',
                data: trendData.durations.length > 0 ? trendData.durations : [0],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#f59e0b',
                pointRadius: 4,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#1a1d27',
                  borderColor: '#374151',
                  borderWidth: 1
                }
              },
              scales: {
                y: {
                  grid: { color: '#1f2937' },
                  ticks: { color: '#9ca3af' }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: '#9ca3af' }
                }
              }
            }
          });
        }
      }
    } else if (activeSubTab === 'accountability') {
      // 4. Draw Velocity trend line chart
      if (velocityRef.current) {
        const ctx = velocityRef.current.getContext('2d');
        if (ctx) {
          velocityChartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
              labels: velocityLabels.length > 0 ? velocityLabels : ["No Data"],
              datasets: [{
                label: 'Overall Completion Rate %',
                data: velocityData.length > 0 ? velocityData : [0],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#10b981',
                pointRadius: 5,
                pointHoverRadius: 7,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#1a1d27',
                  borderColor: '#374151',
                  borderWidth: 1,
                  callbacks: {
                    label: (context: any) => `Overall Completion: ${context.raw}%`
                  }
                }
              },
              scales: {
                y: {
                  min: 0,
                  max: 100,
                  grid: { color: '#1f2937' },
                  ticks: { color: '#9ca3af', callback: (val: any) => `${val}%` }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: '#9ca3af' }
                }
              }
            }
          });
        }
      }
    }

    // Cleanup
    return () => {
      if (barChartInstance.current) barChartInstance.current.destroy();
      if (pieChartInstance.current) pieChartInstance.current.destroy();
      if (companyChartInstance.current) companyChartInstance.current.destroy();
      if (lineChartInstance.current) lineChartInstance.current.destroy();
      if (velocityChartInstance.current) velocityChartInstance.current.destroy();
    };
  }, [meetings, activeSubTab, accCompanyFilter]);

  return (
    <div className="space-y-6 pb-16">
      {/* Tab select menu */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 pb-3 gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('metrics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
              activeSubTab === 'metrics'
                ? 'bg-[#6c63ff] border-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/20'
                : 'bg-[#1a1d27] border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Metrics Overview
          </button>
          <button
            onClick={() => setActiveSubTab('accountability')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
              activeSubTab === 'accountability'
                ? 'bg-[#6c63ff] border-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/20'
                : 'bg-[#1a1d27] border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Accountability Dashboard
          </button>
        </div>

        {activeSubTab === 'accountability' && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px] shrink-0">Filter Company:</span>
            <select
              value={accCompanyFilter}
              onChange={(e) => setAccCompanyFilter(e.target.value as any)}
              className="bg-[#1a1d27] border border-gray-800 text-gray-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
            >
              <option value="all">All Companies</option>
              <option value="Company Wide">Company Wide</option>
              <option value="Corrugated">Corrugated</option>
              <option value="Paper & Board">Paper & Board</option>
            </select>
          </div>
        )}
      </div>

      {activeSubTab === 'metrics' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Meetings</p>
                <p className="text-3xl font-bold mt-1 text-white">{totalMeetings}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#6c63ff]/10 flex items-center justify-center text-[#6c63ff]">
                <CalendarDays className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider font-sans">Avg Duration</p>
                <p className="text-3xl font-bold mt-1 text-white">{avgDuration}m</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Pending Actions</p>
                <p className="text-3xl font-bold mt-1 text-white">{pendingTasks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Busiest Day</p>
                <p className="text-lg font-bold mt-2 text-white truncate max-w-36">{busiestDay}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Grid of charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Activity */}
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart className="w-5 h-5 text-[#6c63ff]" />
                <h3 className="font-bold text-base text-gray-200">Meetings Per Week (Last 8 Weeks)</h3>
              </div>
              <div className="h-64 relative">
                {totalMeetings > 0 ? (
                  <canvas ref={barRef} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
                    No meetings recorded yet
                  </div>
                )}
              </div>
            </div>

            {/* Categories Breakdown */}
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-gray-200">Meetings Breakdown by Category</h3>
              </div>
              <div className="h-64 relative">
                {totalMeetings > 0 ? (
                  <canvas ref={pieRef} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
                    No meetings recorded yet
                  </div>
                )}
              </div>
            </div>

            {/* Company Breakdown */}
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-gray-200">Meetings Breakdown by Company</h3>
              </div>
              <div className="h-64 relative">
                {totalMeetings > 0 ? (
                  <canvas ref={companyRef} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
                    No meetings recorded yet
                  </div>
                )}
              </div>
            </div>

            {/* Avg Duration Trend */}
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <LineChart className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-gray-200 font-sans">Meeting Duration Trend (Last 10 Meetings)</h3>
              </div>
              <div className="h-64 relative">
                {totalMeetings > 0 ? (
                  <canvas ref={lineRef} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
                    No meeting durations available
                  </div>
                )}
              </div>
            </div>

            {/* Top Attendees */}
            <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-gray-200">Top 5 Active Attendees</h3>
              </div>
              <div className="overflow-x-auto">
                {topAttendees.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Attendee Name</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4 text-right">Meetings Attended</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {topAttendees.map((att, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors text-sm text-gray-300">
                          <td className="py-3 px-4 flex items-center gap-2 font-medium text-white">
                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-200 font-bold border border-gray-700">
                              {att.name.charAt(0).toUpperCase()}
                            </div>
                            {att.name}
                          </td>
                          <td className="py-3 px-4 text-gray-400">{att.role}</td>
                          <td className="py-3 px-4 text-right font-bold text-white">{att.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                    No attendee data recorded yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Heatmap Grid & Velocity Trend Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* BOTTLENECK CARDS */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-base text-white">Action Item Bottlenecks</h3>
              </div>
              <p className="text-xs text-gray-400 leading-normal mb-2">
                Surfacing individuals with the highest volume of outstanding action items this cycle.
              </p>

              {bottlenecksList.length > 0 ? (
                bottlenecksList.map((bot, i) => (
                  <div key={i} className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute right-3 top-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                      Rank {i + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-white">{bot.owner}</h4>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-0.5">Assigned Resource</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center bg-[#11131a] border border-gray-800 rounded-xl p-2">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 block">Assigned</span>
                        <span className="text-sm font-black text-gray-300">{bot.total}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 block">Pending</span>
                        <span className="text-sm font-black text-rose-400">{bot.pending}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 block">Rate</span>
                        <span className={`text-sm font-black ${
                          bot.rate >= 80 ? 'text-emerald-400' :
                          bot.rate >= 50 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>{bot.rate}%</span>
                      </div>
                    </div>

                    {/* Completion progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                        <span>COMPLETION RATE</span>
                        <span>{bot.rate}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            bot.rate >= 80 ? 'bg-emerald-500' :
                            bot.rate >= 50 ? 'bg-amber-500' :
                            'bg-rose-500'
                          }`}
                          style={{ width: `${bot.rate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-xs italic">
                  No action items found to compute bottlenecks.
                </div>
              )}
            </div>

            {/* VELOCITY TREND LINE CHART */}
            <div className="lg:col-span-2 bg-[#1a1d27] border border-gray-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <LineChart className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-base text-gray-200">Velocity Completion Trend Line</h3>
                </div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-4">
                  Overall action item completion percentage per sequential meeting cycle (Last 8 reviews)
                </p>
              </div>

              <div className="h-64 relative flex-1 min-h-[220px]">
                {last8Cycles.length > 0 ? (
                  <canvas ref={velocityRef} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm">
                    No meeting histories available under this company filter
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* HEATMAP GRID */}
          <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Grid3X3 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-base text-white">Accountability Heatmap Grid</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Rows depict individuals; columns denote the last 8 MOR/SOR/POR cycles chronologically. Hover cells for status.
                </p>
              </div>

              {/* Legend indicators */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase font-bold text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30 inline-block" /> High (&gt;80%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/30 inline-block" /> Medium (50-80%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500/10 border border-rose-500/30 inline-block" /> Low (&lt;50%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-gray-800/40 border border-gray-750 inline-block" /> No Action Items
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-[#11131a]">
              {heatmapOwners.length > 0 && last8Cycles.length > 0 ? (
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-800/80 text-[10px] text-gray-500 font-extrabold uppercase tracking-widest bg-[#161a24]">
                      <th className="py-3 px-4 w-1/4">Assigned Resource</th>
                      {last8Cycles.map((cycle, cIdx) => (
                        <th key={cIdx} className="py-3 px-3 text-center text-xs">
                          <div className="font-black text-gray-300">{cycle.category}</div>
                          <div className="text-[9px] font-semibold text-gray-500 font-mono mt-0.5">{cycle.date.substring(5)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-medium">
                    {heatmapOwners.map((owner, oIdx) => (
                      <tr key={oIdx} className="hover:bg-white/[0.02] text-sm text-gray-300">
                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-indigo-500/10 text-indigo-300 flex items-center justify-center font-black text-xs">
                            {owner.charAt(0).toUpperCase()}
                          </div>
                          <span>{owner}</span>
                        </td>
                        {last8Cycles.map((cycle, cIdx) => {
                          const rate = getOwnerCycleCompletion(owner, cycle);
                          let colorClass = 'bg-gray-800/20 border-gray-800 text-gray-500';
                          let hoverTitle = `${owner}: No action items in this meeting`;
                          let labelText = '-';

                          if (rate !== null) {
                            labelText = `${Math.round(rate)}%`;
                            if (rate > 80) {
                              colorClass = 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400';
                              hoverTitle = `${owner}: Completed ${labelText} (>80%) - High compliance`;
                            } else if (rate >= 50) {
                              colorClass = 'bg-amber-500/20 border-amber-500/30 text-amber-400';
                              hoverTitle = `${owner}: Completed ${labelText} (50-80%) - Medium compliance`;
                            } else {
                              colorClass = 'bg-rose-500/10 border-rose-500/35 text-rose-400';
                              hoverTitle = `${owner}: Completed ${labelText} (<50%) - Critical backlog alert`;
                            }
                          }

                          return (
                            <td key={cIdx} className="py-3 px-3 text-center">
                              <div
                                title={hoverTitle}
                                className={`inline-flex items-center justify-center w-12 h-9 rounded-lg text-xs font-black font-mono border transition-all hover:scale-105 cursor-help ${colorClass}`}
                              >
                                {labelText}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-500 text-xs italic">
                  No meeting cycles or action item owners discovered for the selection.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
