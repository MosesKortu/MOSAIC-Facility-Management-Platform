import { useLocation, useSearchParams } from 'react-router';
import { TabLinks } from '../../components/ui/tabs.tsx';

/** Internal / External / Groups — the three views of People administration (08 §10). */
export function PeopleTabs() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onPeople = pathname === '/admin/people';
  const external = params.get('type') === 'external';
  return (
    <TabLinks label="People" tabs={[
      { to: '/admin/people', label: 'Internal', active: onPeople && !external },
      { to: '/admin/people?type=external', label: 'External', active: onPeople && external },
      { to: '/admin/groups', label: 'Groups', active: pathname === '/admin/groups' },
    ]} />
  );
}
