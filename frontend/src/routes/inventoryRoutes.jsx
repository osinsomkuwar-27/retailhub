import { lazy } from 'react';
import { LayoutDashboard, Package, FolderTree, Warehouse, Boxes, ArrowLeftRight, CalendarClock, History, PackagePlus, PackageSearch } from 'lucide-react';

const P = (name) => lazy(() => import(`../pages/inventory/${name}.jsx`));
const roles = ['ADMIN', 'WAREHOUSE_MANAGER'];
const admin = ['ADMIN'];

// Same shape as Module 3's intelligenceRoutes.
// Person 4: map this array into <Route>s inside the protected layout and the sidebar.
// Entries with `hidden: true` are routes only (not shown in the sidebar).
export const inventoryRoutes = [
  { path: '/inventory', label: 'Inventory Dashboard', icon: LayoutDashboard, element: P('InventoryDashboard'), roles },
  { path: '/inventory/products', label: 'Products', icon: Package, element: P('ProductListing'), roles: admin },
  { path: '/inventory/products/new', label: 'Add Product', icon: PackagePlus, element: P('AddProduct'), roles: admin, hidden: true },
  { path: '/inventory/products/:id/edit', label: 'Edit Product', icon: PackageSearch, element: P('EditProduct'), roles: admin, hidden: true },
  { path: '/inventory/categories', label: 'Categories', icon: FolderTree, element: P('CategoryManagement'), roles: admin },
  { path: '/inventory/warehouses', label: 'Warehouses', icon: Warehouse, element: P('WarehouseManagement'), roles },
  { path: '/inventory/stock', label: 'Stock Management', icon: Boxes, element: P('StockManagement'), roles },
  { path: '/inventory/transfers', label: 'Stock Transfer', icon: ArrowLeftRight, element: P('StockTransfer'), roles },
  { path: '/inventory/batches', label: 'Batch & Expiry', icon: CalendarClock, element: P('BatchExpiryManagement'), roles },
  { path: '/inventory/history', label: 'Inventory History', icon: History, element: P('InventoryHistory'), roles },
];
