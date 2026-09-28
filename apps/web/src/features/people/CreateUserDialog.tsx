import { zodResolver } from '@hookform/resolvers/zod';
import { CreateUserBody, ROLES, type UserDetail } from '@mosaic/contracts';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { applyApiError } from '../../lib/form-errors.ts';
import { ROLE_LABEL, USER_TYPE_LABEL } from '../auth/roles.ts';
import { useCreateUser } from './api.ts';
import { UserPicker } from './UserPicker.tsx';

// Same rules as the API (CreateUserBody), plus the sponsor rule checked before submitting.
const FormSchema = CreateUserBody.extend({ sponsor_user_id: z.string().nullable() }).superRefine((form, ctx) => {
  if (form.user_type === 'external' && !form.sponsor_user_id) {
    ctx.addIssue({ code: 'custom', path: ['sponsor_user_id'], message: 'Choose the internal sponsor for this collaborator' });
  }
});
type Form = z.input<typeof FormSchema>;

const FIELDS = ['full_name', 'email', 'sso_identifier', 'role', 'user_type', 'sponsor_user_id'] as const;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: UserDetail) => void;
  defaultType?: 'internal' | 'external';
}

export function CreateUserDialog({ open, onOpenChange, onCreated, defaultType = 'internal' }: CreateUserDialogProps) {
  const create = useCreateUser();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, setError, control, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(FormSchema),
    defaultValues: { full_name: '', email: '', sso_identifier: '', role: 'standard_user', user_type: defaultType, sponsor_user_id: null },
  });
  const userType = useWatch({ control, name: 'user_type' });

  function close(next: boolean) {
    if (!next) {
      reset();
      setFormError(null);
      create.reset();
    }
    onOpenChange(next);
  }

  const submit = handleSubmit((form) => {
    setFormError(null);
    const body = { ...form, sponsor_user_id: form.user_type === 'external' ? form.sponsor_user_id : null };
    create.mutate(body, {
      onSuccess: (user) => {
        close(false);
        onCreated(user);
      },
      onError: (error) => setFormError(applyApiError(error, setError, FIELDS, {
        INVALID_SPONSOR: 'sponsor_user_id', ROLE_NOT_ALLOWED_FOR_EXTERNAL: 'role',
      })),
    });
  });

  return (
    <Dialog open={open} onOpenChange={close} title="Add a person"
      description="Creates a MOSAIC account. The person signs in with their institutional identity."
      footer={(
        <>
          <Button variant="ghost" onClick={() => close(false)} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" form="create-user" loading={create.isPending}>Create person</Button>
        </>
      )}>
      <form id="create-user" onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="The person could not be created">{formError}</Alert>}
        <SelectField label="Account type" {...register('user_type', {
          onChange: (e: { target: { value: string } }) => {
            if (e.target.value === 'external') setValue('role', 'standard_user');
          },
        })}>
          <option value="internal">{USER_TYPE_LABEL.internal}</option>
          <option value="external">{USER_TYPE_LABEL.external}</option>
        </SelectField>
        <TextField label="Full name" autoComplete="off" error={errors.full_name?.message} {...register('full_name')} />
        <TextField label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <TextField label="SSO identifier" autoComplete="off" hint="The identifier the institutional login provides for this person."
          error={errors.sso_identifier?.message} {...register('sso_identifier')} />
        <SelectField label="Role" error={errors.role?.message} {...register('role')}>
          {(userType === 'external' ? (['standard_user'] as const) : ROLES).map((role) => (
            <option key={role} value={role}>{ROLE_LABEL[role]}</option>
          ))}
        </SelectField>
        {userType === 'external' && (
          <Controller control={control} name="sponsor_user_id" render={({ field, fieldState }) => (
            <UserPicker label="Internal sponsor" value={field.value ?? null} onChange={field.onChange}
              filter={{ user_type: 'internal', is_active: 'true' }} error={fieldState.error?.message} />
          )} />
        )}
      </form>
    </Dialog>
  );
}
