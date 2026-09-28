import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

const TONES = {
  info: { className: 'bg-pix-blue-10 text-pix-blue border-pix-blue-25', Icon: Info },
  success: { className: 'bg-success-surface text-success border-success/30', Icon: CheckCircle2 },
  warning: { className: 'bg-warning-surface text-warning-ink border-pix-yellow', Icon: AlertTriangle },
  danger: { className: 'bg-danger-surface text-danger border-danger/30', Icon: XCircle },
} as const;

interface AlertProps {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** Page/section message. Danger interrupts assistive tech (role=alert); other tones are polite. */
export function Alert({ tone, title, children, action }: AlertProps) {
  const { className, Icon } = TONES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4', className)}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-body-sm text-ink">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
