import { zodResolver } from '@hookform/resolvers/zod';
import { CreateGroupBody, type GroupDetail } from '@mosaic/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextAreaField, TextField } from '../../components/ui/field.tsx';
import { applyApiError } from '../../lib/form-errors.ts';
import { useCreateGroup, useUpdateGroup } from './api.ts';

type Form = z.input<typeof CreateGroupBody>;

interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this group; omitted = create a new one. */
  group?: GroupDetail;
  onSaved?: (group: GroupDetail) => void;
}

export function GroupFormDialog({ open, onOpenChange, group, onSaved }: GroupFormDialogProps) {
  const create = useCreateGroup();
  const update = useUpdateGroup(group?.group_id ?? '');
  const mutation = group ? update : create;
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(CreateGroupBody),
    values: { name: group?.name ?? '', description: group?.description ?? '' },
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
    const body = { name: form.name, description: form.description?.trim() || null };
    mutation.mutate(body, {
      onSuccess: (saved) => {
        close(false);
        onSaved?.(saved);
      },
      onError: (error) => setFormError(applyApiError(error, setError, ['name', 'description'] as const)),
    });
  });

  return (
    <Dialog open={open} onOpenChange={close} title={group ? 'Edit group' : 'Create group'}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" form="group-form" loading={mutation.isPending}>{group ? 'Save changes' : 'Create group'}</Button>
      </>}>
      <form id="group-form" onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="The group was not saved">{formError}</Alert>}
        <TextField label="Name" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <TextAreaField label="Description" hint="Optional: research focus or PI." error={errors.description?.message} {...register('description')} />
      </form>
    </Dialog>
  );
}
