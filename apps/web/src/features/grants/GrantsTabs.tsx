import { useLocation, useSearchParams } from 'react-router';
import { TabLinks } from '../../components/ui/tabs.tsx';

/** Grants · Group allocations · Spending (08 §33). */
export function GrantsTabs() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onAllocations = pathname === '/admin/grant-allocations';
  const spending = params.get('view') === 'spending';
  return (
    <TabLinks label="Grants and funding" tabs={[
      { to: '/admin/grants', label: 'Grants', active: pathname === '/admin/grants' },
      { to: '/admin/grant-allocations', label: 'Group allocations', active: onAllocations && !spending },
      { to: '/admin/grant-allocations?view=spending', label: 'Spending', active: onAllocations && spending },
    ]} />
  );
}
