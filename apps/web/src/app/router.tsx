import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { NotFound, PageLoading } from '../components/ui/states.tsx';
import { RequireRole, RequireSession } from '../features/auth/guards.tsx';
import { LoginPage } from '../features/auth/LoginPage.tsx';
import { RESEARCHER_ROLES } from '../features/auth/roles.ts';
import { HomePage } from '../features/home/HomePage.tsx';
import { Shell } from './Shell.tsx';

/** Route-level code splitting: loads a page module on first visit and uses its named export. */
function page<M>(load: () => Promise<M>, name: keyof M) {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

/** /admin/* — admin only (08 §56). The API enforces the same rule on every endpoint. */
export const adminRoutes: RouteObject = {
  path: 'admin',
  handle: { title: 'Administration' },
  element: <RequireRole roles={['admin']} what="administration"><Outlet /></RequireRole>,
  children: [
    { index: true, element: <Navigate to="people" replace /> },
    // Each admin page is its own chunk: researchers never download administration code (09 §6).
    { path: 'people', lazy: page(() => import('../features/people/PeoplePage.tsx'), 'PeoplePage'), handle: { title: 'People' } },
    { path: 'people/:userId', lazy: page(() => import('../features/people/UserDetailPage.tsx'), 'UserDetailPage'), handle: { title: 'Person' } },
    { path: 'groups', lazy: page(() => import('../features/groups/GroupsPage.tsx'), 'GroupsPage'), handle: { title: 'Groups' } },
    { path: 'groups/:groupId', lazy: page(() => import('../features/groups/GroupDetailPage.tsx'), 'GroupDetailPage'), handle: { title: 'Group' } },
    { path: 'grants', lazy: page(() => import('../features/grants/GrantsPage.tsx'), 'GrantsPage'), handle: { title: 'Grants & funding' } },
    { path: 'grants/:grantId', lazy: page(() => import('../features/grants/GrantDetailPage.tsx'), 'GrantDetailPage'), handle: { title: 'Grant' } },
    { path: 'grant-allocations', lazy: page(() => import('../features/grants/AllocationsPage.tsx'), 'AllocationsPage'), handle: { title: 'Grants & funding' } },
    { path: 'equipment', lazy: page(() => import('../features/admin-equipment/AdminEquipmentPage.tsx'), 'AdminEquipmentPage'), handle: { title: 'Equipment portfolio' } },
    { path: 'equipment/:equipmentId', lazy: page(() => import('../features/admin-equipment/AdminEquipmentDetailPage.tsx'), 'AdminEquipmentDetailPage'), handle: { title: 'Instrument' } },
    { path: 'tariffs', lazy: page(() => import('../features/admin-equipment/TariffsPage.tsx'), 'TariffsPage'), handle: { title: 'Support tariffs' } },
    { path: 'audit', lazy: page(() => import('../features/audit/AuditPage.tsx'), 'AuditPage'), handle: { title: 'Administrative audit' } },
  ],
};

/** /operations/* — super users and admins: today's exceptions (08 §3). */
export const operationsRoutes: RouteObject = {
  path: 'operations',
  handle: { title: 'Operations' },
  element: <RequireRole roles={['super_user', 'admin']} what="operations"><Outlet /></RequireRole>,
  children: [
    { index: true, element: <Navigate to="certifications" replace /> },
    { path: 'certifications', lazy: page(() => import('../features/training/CertificationQueuePage.tsx'), 'CertificationQueuePage'), handle: { title: 'Certification queue' } },
    { path: 'equipment', lazy: page(() => import('../features/operations/EquipmentStatusPage.tsx'), 'EquipmentStatusPage'), handle: { title: 'Equipment status' } },
    { path: 'bookings', lazy: page(() => import('../features/bookings/AllBookingsPage.tsx'), 'AllBookingsPage'), handle: { title: 'All bookings' } },
  ],
};

/** Researcher application (all roles that book): discovery and the user's own work. */
export const researcherRoutes: RouteObject = {
  element: <RequireRole roles={RESEARCHER_ROLES} what="the researcher application"><Outlet /></RequireRole>,
  children: [
    { path: 'equipment', lazy: page(() => import('../features/equipment/EquipmentPage.tsx'), 'EquipmentPage'), handle: { title: 'Equipment' } },
    { path: 'equipment/:equipmentId', lazy: page(() => import('../features/equipment/EquipmentDetailPage.tsx'), 'EquipmentDetailPage'), handle: { title: 'Instrument' } },
    { path: 'equipment/:equipmentId/book', lazy: page(() => import('../features/bookings/BookingPage.tsx'), 'BookingPage'), handle: { title: 'Book' } },
    { path: 'bookings', lazy: page(() => import('../features/bookings/MyBookingsPage.tsx'), 'MyBookingsPage'), handle: { title: 'My bookings' } },
    { path: 'bookings/:bookingId', lazy: page(() => import('../features/bookings/BookingDetailPage.tsx'), 'BookingDetailPage'), handle: { title: 'Booking' } },
    { path: 'training', lazy: page(() => import('../features/training/TrainingPage.tsx'), 'TrainingPage'), handle: { title: 'Training & certifications' } },
    { path: 'training/:equipmentId', lazy: page(() => import('../features/training/TrainingDetailPage.tsx'), 'TrainingDetailPage'), handle: { title: 'Training' } },
    { path: 'certifications', element: <Navigate to="/training" replace /> },
    { path: 'notifications', lazy: page(() => import('../features/notifications/NotificationsPage.tsx'), 'NotificationsPage'), handle: { title: 'Notifications' } },
  ],
};

/** Route tree (08_IMPLEMENTATION_CONTRACT.md §55). Role areas are added slice by slice. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireSession />,
    // Shown while a lazily loaded page's code downloads on a direct deep link.
    hydrateFallbackElement: <PageLoading />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <HomePage />, handle: { title: 'Home' } },
          researcherRoutes,
          operationsRoutes,
          adminRoutes,
          { path: '*', element: <NotFound />, handle: { title: 'Not found' } },
        ],
      },
    ],
  },
]);
