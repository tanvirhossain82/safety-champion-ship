'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Building2, ClipboardCheck, Trophy, Medal, Award, Crown,
  TrendingUp, Loader2, Sparkles, ChevronLeft, ChevronRight, Calendar,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { fetchRankedEvaluations, RankedRow } from '@/lib/data';
import { Employee, DEPARTMENTS, MONTH_NAMES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';

export function DashboardClient() {
  const { profile } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ranked, setRanked] = useState<RankedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, rankData] = await Promise.all([
        supabase.from('employees').select('*').eq('status', 'Active'),
        fetchRankedEvaluations(month, year),
      ]);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
      setRanked(rankData);
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadData(); }, [loadData]);

  const top3 = ranked.slice(0, 3);
  const champion = top3[0];

  const departmentCounts = useMemo(() => {
    return DEPARTMENTS.map((d) => ({ dept: d, count: employees.filter((e) => e.department === d).length }));
  }, [employees]);

  const departmentAvgScores = useMemo(() => {
    return DEPARTMENTS.map((d) => {
      const deptRows = ranked.filter((r) => r.department === d);
      const avg = deptRows.length > 0
        ? Math.round((deptRows.reduce((s, r) => s + r.total_marks, 0) / deptRows.length) * 10) / 10
        : 0;
      return { dept: d, avg, count: deptRows.length };
    });
  }, [ranked]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {profile?.full_name || profile?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Champion banner */}
      {champion && (
        <Card className="relative overflow-hidden border-gold/40 bg-gradient-to-r from-gold/10 via-accent/5 to-transparent animate-scale-in">
          <div className="absolute right-0 top-0 h-full w-1/3 opacity-10">
            <Crown className="absolute right-8 top-1/2 h-40 w-40 -translate-y-1/2 text-gold" />
          </div>
          <CardContent className="relative flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20 border-4 border-gold shadow-lg">
                <AvatarImage src={champion.photo ?? undefined} />
                <AvatarFallback className="bg-gold/20 text-xl font-bold text-gold">
                  {getInitials(champion.name)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gold text-white shadow-md animate-pulse-glow">
                <Crown className="h-4 w-4" />
              </div>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="mb-1 flex items-center justify-center gap-2 sm:justify-start">
                <Sparkles className="h-4 w-4 text-gold" />
                <span className="text-xs font-bold uppercase tracking-wider text-gold">
                  {MONTH_NAMES[month - 1]} {year} Champion
                </span>
              </div>
              <h2 className="text-2xl font-bold">{champion.name}</h2>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
                <span>{champion.employee_code}</span>
                <span>·</span>
                <span>{champion.department}</span>
                <span>·</span>
                <span className="font-bold text-foreground">{Number(champion.total_marks)} / 100</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Employees" value={employees.length} color="primary" delay="animate-fade-in" />
        <StatCard icon={Building2} label="Total Departments" value={DEPARTMENTS.length} color="chart-3" delay="animate-fade-in-delay-1" />
        <StatCard icon={ClipboardCheck} label={`${MONTH_NAMES[month - 1]} Evaluations`} value={ranked.length} color="accent" delay="animate-fade-in-delay-2" />
        <StatCard icon={Trophy} label="Champions Crowned" value={champion ? 1 : 0} color="gold" delay="animate-fade-in-delay-3" />
      </div>

      {/* Winner cards */}
      {top3.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <WinnerCard row={top3[0]} rank={1} />
          {top3[1] && <WinnerCard row={top3[1]} rank={2} />}
          {top3[2] && <WinnerCard row={top3[2]} rank={3} />}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-medium">No evaluations yet for {MONTH_NAMES[month - 1]} {year}</h3>
            <p className="text-sm text-muted-foreground">Submit evaluations to see the champion podium.</p>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Department Score Comparison</CardTitle>
            <CardDescription>Average total marks by department — {MONTH_NAMES[month - 1]} {year}</CardDescription>
          </CardHeader>
          <CardContent>
            {departmentAvgScores.some((d) => d.avg > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={departmentAvgScores}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="dept" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    formatter={(v: number) => [`${v} avg`, 'Score']}
                  />
                  <Bar dataKey="avg" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} name="Avg Score" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Employee Distribution</CardTitle>
            <CardDescription>Active employees per department</CardDescription>
          </CardHeader>
          <CardContent>
            {employees.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={departmentCounts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="dept" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    formatter={(v: number) => [`${v} employees`, 'Count']}
                  />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} name="Employees" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Score breakdown for top performers */}
      {top3.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Performers — Score Breakdown</CardTitle>
            <CardDescription>Department, HR, and Safety marks for the podium</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {top3.map((row) => {
                const pct = (n: number, max: number) => Math.min(100, (Number(n) / max) * 100);
                return (
                  <div key={row.evaluation_id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <Badge variant="outline" className={rankBadgeClass(row.rank)}>
                        #{row.rank}
                      </Badge>
                      <span className="font-medium">{row.name}</span>
                      <span className="text-sm text-muted-foreground">{row.department}</span>
                      <span className="ml-auto text-lg font-bold">{Number(row.total_marks)}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <ScoreBar label="Department" value={Number(row.department_marks)} max={45} color="bg-primary" pct={pct(row.department_marks, 45)} />
                      <ScoreBar label="HR" value={Number(row.hr_marks)} max={25} color="bg-chart-3" pct={pct(row.hr_marks, 25)} />
                      <ScoreBar label="Safety" value={Number(row.safety_marks)} max={30} color="bg-accent" pct={pct(row.safety_marks, 30)} />
                    </div>
                    {Number(row.negative_marks) > 0 && (
                      <div className="mt-2 text-sm text-destructive">
                        Negative marks: -{Number(row.negative_marks)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, delay }: { icon: React.ElementType; label: string; value: number; color: string; delay: string }) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    'chart-3': 'bg-chart-3/10 text-chart-3',
    gold: 'bg-gold/10 text-gold',
  };
  return (
    <Card className={delay}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorMap[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function WinnerCard({ row, rank }: { row: RankedRow; rank: number }) {
  const config = {
    1: { label: 'Champion', icon: Crown, badge: 'bg-gold text-white', ring: 'border-gold/50', glow: 'animate-pulse-glow' },
    2: { label: 'Runner-up', icon: Medal, badge: 'bg-silver text-white', ring: 'border-silver/50', glow: '' },
    3: { label: '3rd Position', icon: Award, badge: 'bg-bronze text-white', ring: 'border-bronze/50', glow: '' },
  }[rank]!;

  const Icon = config.icon;

  return (
    <Card className={`relative overflow-hidden ${config.ring} ${rank === 1 ? 'lg:scale-[1.02]' : ''}`}>
      <div className={`h-1.5 w-full ${rank === 1 ? 'bg-gold' : rank === 2 ? 'bg-silver' : 'bg-bronze'}`} />
      <CardContent className="flex flex-col items-center p-6 text-center">
        <div className="relative mb-4">
          <Avatar className={`h-24 w-24 border-4 ${rank === 1 ? 'border-gold' : rank === 2 ? 'border-silver' : 'border-bronze'} shadow-lg`}>
            <AvatarImage src={row.photo ?? undefined} />
            <AvatarFallback className="bg-muted text-lg font-bold">
              {getInitials(row.name)}
            </AvatarFallback>
          </Avatar>
          <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full ${config.badge} shadow-md ${config.glow}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={`mb-1 text-xs font-bold uppercase tracking-wider ${rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : 'text-bronze'}`}>
          {config.label}
        </div>
        <h3 className="text-lg font-bold">{row.name}</h3>
        <p className="text-sm text-muted-foreground">{row.employee_code}</p>
        <Badge variant="secondary" className="mt-2">{row.department}</Badge>
        <div className="mt-4 w-full rounded-lg bg-muted/50 p-3">
          <div className="text-3xl font-bold">{Number(row.total_marks)}</div>
          <div className="text-xs text-muted-foreground">out of 100 marks</div>
        </div>
        <div className="mt-3 flex w-full justify-around text-xs text-muted-foreground">
          <div><span className="font-semibold text-foreground">{Number(row.department_marks)}</span> Dept</div>
          <div><span className="font-semibold text-foreground">{Number(row.hr_marks)}</span> HR</div>
          <div><span className="font-semibold text-foreground">{Number(row.safety_marks)}</span> Safety</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, value, max, color, pct }: { label: string; value: number; max: number; color: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} / {max}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center text-center">
      <div>
        <TrendingUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No data to display yet</p>
      </div>
    </div>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'border-gold/40 text-gold bg-gold/10';
  if (rank === 2) return 'border-silver/40 text-silver bg-silver/10';
  if (rank === 3) return 'border-bronze/40 text-bronze bg-bronze/10';
  return '';
}
