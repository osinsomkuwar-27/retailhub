import { useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, PackageX, ShieldAlert, CalendarClock, ShoppingCart, Truck, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';
import { intelligenceService as api, errMsg } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, IntelStat, Panel, Async, Table, Badge, riskTone, severityTone, pretty, fmtDateTime, btnGhost, PALETTE } from '../../components/intelligence/ui';

export default function SmartDashboard() {
  const q = useIntelQuery(() => api.dashboard(), [], { interval: 30000 });
  const [running, setRunning] = useState(false);
  const d = q.data;

  const runScans = async () => {
    setRunning(true);
    try { await api.runJob('lowStockScan'); await api.runJob('anomalySweep'); await api.runJob('expiryScan'); toast.success('Scans completed'); q.reload(); }
    catch (e) { toast.error(errMsg(e)); } finally { setRunning(false); }
  };

  return (
    <div>
      <PageHeader title="Smart Inventory Dashboard" subtitle="Rule-based monitoring of stock, demand, anomalies, expiry and suppliers. Auto-refreshes every 30s."
        actions={<button className={btnGhost} onClick={runScans} disabled={running}><RefreshCw size={14} className={running ? 'animate-spin' : ''} />Run scans now</button>} />
      <Async q={q}>
        {d && (<>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <IntelStat label="Open alerts" value={d.kpis.openAlerts} icon={BellRing} tone={d.kpis.openAlerts ? 'amber' : 'teal'} />
            <IntelStat label="Stock-out risk" value={d.kpis.criticalPredictions} icon={PackageX} tone={d.kpis.criticalPredictions ? 'red' : 'teal'} hint="critical + out of stock" />
            <IntelStat label="Open anomalies" value={d.kpis.openAnomalies} icon={ShieldAlert} tone={d.kpis.openAnomalies ? 'red' : 'teal'} />
            <IntelStat label="Expiring batches" value={d.kpis.expiringBatches} icon={CalendarClock} tone={d.kpis.expiringBatches ? 'amber' : 'teal'} />
            <IntelStat label="Need reorder" value={d.kpis.reorderNeeded} icon={ShoppingCart} />
            <IntelStat label="Overdue POs" value={d.kpis.overdueSupplierOrders} icon={Truck} tone={d.kpis.overdueSupplierOrders ? 'amber' : 'teal'} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Panel title="Stock health distribution">
              <div className="h-56"><ResponsiveContainer><PieChart>
                <Pie data={d.riskDistribution} dataKey="count" nameKey="status" innerRadius={45} outerRadius={80} label={(e) => pretty(e.status)}>
                  {d.riskDistribution.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
                <Tooltip /></PieChart></ResponsiveContainer></div>
            </Panel>
            <Panel title="Active alerts by severity">
              <div className="h-56"><ResponsiveContainer><BarChart data={d.alertsBySeverity.map((s) => ({ name: pretty(s._id), count: s.count }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </Panel>
            <Panel title="Anomalies, last 14 days">
              <div className="h-56"><ResponsiveContainer><LineChart data={d.anomalyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} /><YAxis allowDecimals={false} /><Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0f2a4a" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
            </Panel>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Highest stock-out risk">
              <Table rowKey="productId" empty="No products with active demand" rows={d.topRisks} columns={[
                { key: 'name', header: 'Product', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
                { key: 'available', header: 'Stock' },
                { key: 'avgDailySales', header: 'Sales/day' },
                { key: 'daysUntilStockout', header: 'Days left' },
                { key: 'riskStatus', header: 'Risk', render: (r) => <Badge tone={riskTone[r.riskStatus]}>{pretty(r.riskStatus)}</Badge> },
              ]} />
            </Panel>
            <Panel title="Recent alerts">
              {d.recentAlerts.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No active alerts 🎉</p> :
                <ul className="divide-y divide-slate-100">{d.recentAlerts.map((a) => (
                  <li key={a._id} className="flex items-start gap-3 py-2.5">
                    <Badge tone={severityTone[a.severity]}>{a.severity}</Badge>
                    <div className="min-w-0 flex-1"><p className="text-sm text-slate-700">{a.message}</p>
                      <p className="text-xs text-slate-400">{pretty(a.type)} · {fmtDateTime(a.lastTriggeredAt)}</p></div>
                  </li>))}</ul>}
            </Panel>
          </div>
        </>)}
      </Async>
    </div>
  );
}