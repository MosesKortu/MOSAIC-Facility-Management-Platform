import { Users } from 'lucide-react';
import { Card } from '../../components/ui/card.tsx';
import { useSession } from '../auth/api.ts';
import { ROLE_LABEL, USER_TYPE_LABEL } from '../auth/roles.ts';

function greeting(date: Date): string {
  const hour = date.getHours();
  return hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { data: user } = useSession();
  if (!user) return null;
  const firstName = user.full_name.split(/\s+/)[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section className="rounded-2xl bg-pix-blue p-6 text-white md:p-8">
        <p className="eyebrow text-white/60!">MOSAIC · ICFO Core Facilities</p>
        <h1 className="mt-2 font-title text-title-lg">{greeting(new Date())}, {firstName}.</h1>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Card aria-labelledby="account-heading" className="flex flex-col gap-3">
          <h2 id="account-heading" className="eyebrow">Your account</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
            <dt className="text-ink-muted">Name</dt><dd>{user.full_name}</dd>
            <dt className="text-ink-muted">Email</dt><dd className="break-all">{user.email}</dd>
            <dt className="text-ink-muted">Role</dt><dd>{ROLE_LABEL[user.role]}</dd>
            <dt className="text-ink-muted">Account type</dt><dd>{USER_TYPE_LABEL[user.user_type]}</dd>
          </dl>
        </Card>

        <Card aria-labelledby="groups-heading" className="flex flex-col gap-3">
          <h2 id="groups-heading" className="eyebrow">Research groups</h2>
          {user.groups.length === 0 ? (
            <div className="flex items-start gap-3 text-body text-ink-muted">
              <Users aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
              <p>You are not a member of any research group yet. Group membership gives access to your group's funding — ask a facility administrator to add you.</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {user.groups.map((group) => (
                <li key={group.group_id} className="py-2 text-body">{group.name}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
