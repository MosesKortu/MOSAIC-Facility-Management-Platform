import { zodResolver } from '@hookform/resolvers/zod';
import { CreateGrantBody, type GrantDetail } from '@mosaic/contracts';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { MoneyField } from '../../components/ui/money-field.tsx';
import { applyApiError } from '../../lib/form-errors.ts';
import { UserPicker } from '../people/UserPicker.tsx';
import { useCreateGrant, useUpdateGrant } from './api.ts';
import { fundingErrorMessage } from './messages.ts';

type Form = z.input<typeof CreateGrantBody>;
const FIELDS = ['grant_code', 'pi_user_id', 'allocated_budget', 'expiration_date'] as const;

interface GrantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grant?: GrantDetail;
  onSaved?: (grant: GrantDetail) => void;
}

/** Create a grant, or edit one (only fields that differ are sent). */
export function GrantFormDialog({ open, onOpenChange, grant, onSaved }: GrantFormDialogProps) {
  const create = useCreateGrant();
  const update = useUpdateGrant(grant?.grant_id ?? '');
  const mutation = grant ? update : create;
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, setError, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(CreateGrantBody),
    values: {
      grant_code: grant?.grant_code ?? '', pi_user_id: grant?.pi.user_id ?? '',
      allocated_budget: grant?.allocated_budget ?? '', expiration_date: grant?.expiration_date ?? '',
    },
  });

  function close(next: boolean) {
    if (!next) {
      reset();
      setFormError(null);
      mutation.reset();
    }
    onOpenChange(next);
  }

  const submit = handleSubmit((form) => {
    setFormError(null);
    const onError = (error: unknown) => {
      const unmatched = applyApiError(error, setError, FIELDS, { INVALID_PI: 'pi_user_id' });
      setFormError(unmatched === null ? null : fundingErrorMessage(error));
    };
    const onSuccess = (saved: GrantDetail) => {
      close(false);
      onSaved?.(saved);
    };
    if (grant) {
      const changed = Object.fromEntries(Object.entries(form).filter(([key, value]) =>
        key === 'pi_user_id' ? value !== grant.pi.user_id : value !== grant[key as keyof GrantDetail]));
      if (Object.keys(changed).length === 0) return close(false);
      update.mutate(changed, { onSuccess, onError });
    } else {
      create.mutate(form, { onSuccess, onError });
    }
  });

  return (
    <Dialog open={open} onOpenChange={close} title={grant ? 'Edit grant' : 'Create grant'}
      description={grant ? 'Changing the budget keeps everything already spent.' : 'The full budget starts unallocated.'}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" form="grant-form" loading={mutation.isPending}>{grant ? 'Save changes' : 'Create grant'}</Button>
      </>}>
      <form id="grant-form" onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="The grant was not saved">{formError}</Alert>}
        <TextField label="Grant code" autoComplete="off" className="font-mono" error={errors.grant_code?.message} {...register('grant_code')} />
        <MoneyField label="Total budget" placeholder="50000.00" error={errors.allocated_budget?.message} {...register('allocated_budget')} />
        <TextField label="Expiration date" type="date" error={errors.expiration_date?.message} {...register('expiration_date')} />
        <Controller control={control} name="pi_user_id" render={({ field, fieldState }) => (
          <UserPicker label="Principal investigator" value={field.value || null} onChange={field.onChange}
            filter={{ user_type: 'internal', is_active: 'true' }} error={fieldState.error ? 'Choose the principal investigator' : undefined} />
        )} />
      </form>
    </Dialog>
  );
}
