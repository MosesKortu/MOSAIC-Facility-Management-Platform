import { zodResolver } from '@hookform/resolvers/zod';
import { CreateEquipmentBody, FACILITIES, FACILITY_NAME, type AdminEquipment } from '@mosaic/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextAreaField, TextField } from '../../components/ui/field.tsx';
import { MoneyField } from '../../components/ui/money-field.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { applyApiError } from '../../lib/form-errors.ts';
import { useCreateEquipment, useUpdateEquipment } from '../equipment/api.ts';

type Form = z.input<typeof CreateEquipmentBody>;
const FIELDS = ['code', 'facility', 'name.en', 'description.en', 'base_rate_hourly', 'buffer_time_minutes',
  'certification_validity_months', 'interlock_ip', 'interlock_mqtt_topic'] as const;

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const numberOrNull = (value: unknown) => (value === '' || value === null ? null : Number(value));

interface EquipmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment?: AdminEquipment;
  onSaved?: (equipment: AdminEquipment) => void;
}

/** Create an instrument, or edit its configuration (status changes are separate and always recorded). */
export function EquipmentFormDialog({ open, onOpenChange, equipment, onSaved }: EquipmentFormDialogProps) {
  const create = useCreateEquipment();
  const update = useUpdateEquipment(equipment?.equipment_id ?? '');
  const mutation = equipment ? update : create;
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(CreateEquipmentBody),
    values: {
      code: equipment?.code ?? '', facility: equipment?.facility ?? 'NFL',
      name: { en: equipment?.name.en ?? '', es: equipment?.name.es ?? '', ca: equipment?.name.ca ?? '' },
      description: { en: equipment?.description.en ?? '', es: equipment?.description.es ?? '', ca: equipment?.description.ca ?? '' },
      base_rate_hourly: equipment?.base_rate_hourly ?? '', buffer_time_minutes: equipment?.buffer_time_minutes ?? 30,
      certification_validity_months: equipment?.certification_validity_months ?? null,
      interlock_ip: equipment?.interlock_ip ?? null, interlock_mqtt_topic: equipment?.interlock_mqtt_topic ?? null,
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
    const body = form;
    const onError = (error: unknown) => setFormError(applyApiError(error, setError, FIELDS));
    const onSuccess = (saved: AdminEquipment) => {
      close(false);
      onSaved?.(saved);
    };
    if (!equipment) return create.mutate(body, { onSuccess, onError });
    // Send only what changed; the server audits exactly those fields.
    const changed = Object.fromEntries(Object.entries(body).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(equipment[key as keyof AdminEquipment])));
    if (Object.keys(changed).length === 0) return close(false);
    update.mutate(changed, { onSuccess, onError });
  });

  return (
    <Dialog open={open} onOpenChange={close} title={equipment ? `Edit ${equipment.code}` : 'Add an instrument'}
      description={equipment ? 'Status is changed separately so every change is recorded with a reason.' : 'New instruments start operational, with no bookable hours until you set them.'}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" form="equipment-form" loading={mutation.isPending}>{equipment ? 'Save changes' : 'Add instrument'}</Button>
      </>}>
      <form id="equipment-form" onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger" title="The instrument was not saved">{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Code" className="font-mono uppercase" hint="Letters, digits and underscores" error={errors.code?.message} {...register('code')} />
          <SelectField label="Facility" error={errors.facility?.message} {...register('facility')}>
            {FACILITIES.map((f) => <option key={f} value={f}>{f} — {FACILITY_NAME[f]}</option>)}
          </SelectField>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-1">Name</legend>
          <TextField label="Name (English)" error={errors.name?.en?.message} {...register('name.en')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name (Spanish)" hint="Optional — English is shown if empty" {...register('name.es')} />
            <TextField label="Name (Catalan)" hint="Optional — English is shown if empty" {...register('name.ca')} />
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-1">Description</legend>
          <TextAreaField label="Description (English)" error={errors.description?.en?.message} {...register('description.en')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextAreaField label="Description (Spanish)" {...register('description.es')} />
            <TextAreaField label="Description (Catalan)" {...register('description.ca')} />
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyField label="Hourly rate" placeholder="80.20" error={errors.base_rate_hourly?.message} {...register('base_rate_hourly')} />
          <TextField label="Buffer (minutes)" type="number" min={0} max={240} hint="Gap kept free after each booking"
            error={errors.buffer_time_minutes?.message} {...register('buffer_time_minutes', { valueAsNumber: true })} />
          <TextField label="Certification validity (months)" type="number" min={1} max={120} hint="Empty = never expires"
            error={errors.certification_validity_months?.message} {...register('certification_validity_months', { setValueAs: numberOrNull })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Interlock IP address" className="font-mono" hint="Optional" error={errors.interlock_ip?.message}
            {...register('interlock_ip', { setValueAs: emptyToNull })} />
          <TextField label="Interlock MQTT topic" className="font-mono" hint="Optional — without it, access is manual" error={errors.interlock_mqtt_topic?.message}
            {...register('interlock_mqtt_topic', { setValueAs: emptyToNull })} />
        </div>
      </form>
    </Dialog>
  );
}
