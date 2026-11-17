import { lazy } from 'react';
import { LayoutDashboard, TrendingDown, ShoppingCart, BellRing, ShieldAlert, History, Truck, CalendarClock, ArrowLeftRight } from 'lucide-react';

const P = (name) => lazy(() => import(`../pages/intelligence/${name}.jsx`));
const roles = ['ADMIN', 'WAREHOUSE_MANAGER'];

// Person 4: map this array into <Route>s inside the protected layout and the sidebar.
export const intelligenceRoutes = [
  { path: '/intelligence', label: 'Smart Dashboard', icon: LayoutDashboard, element: P('SmartDashboard'), roles },
  { path: '/intelligence/predictions', label: 'Stock Prediction', icon: TrendingDown, element: P('StockPrediction'), roles },
  { path: '/intelligence/reorder', label: 'Reorder Recommendations', icon: ShoppingCart, element: P('ReorderRecommendations'), roles },
  { path: '/intelligence/alerts', label: 'Low-Stock Alerts', icon: BellRing, element: P('LowStockAlerts'), roles },
  { path: '/intelligence/anomalies', label: 'Anomaly Monitoring', icon: ShieldAlert, element: P('AnomalyMonitoring'), roles },
  { path: '/intelligence/suspicious-history', label: 'Suspicious Activity', icon: History, element: P('SuspiciousActivityHistory'), roles },
  { path: '/intelligence/transfers', label: 'Transfer Suggestions', icon: ArrowLeftRight, element: P('TransferSuggestions'), roles },
  { path: '/intelligence/suppliers', label: 'Supplier Performance', icon: Truck, element: P('SupplierPerformance'), roles },
  { path: '/intelligence/expiry', label: 'Expiry Management', icon: CalendarClock, element: P('ExpiryManagement'), roles },
];