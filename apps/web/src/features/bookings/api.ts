import type {
  Availability, BookingBody, BookingCreated, BookingDetail, BookingListQuery, BookingQuote, BookingSummary, CancelBookingBody,
  FundingOption, Page, PersonRef,
} from '@mosaic/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

export const bookingKeys = {
  list: (query: BookingListQuery) => ['bookings', 'list', query] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
  availability: (equipmentId: string, from: string, to: string) => ['bookings', 'availability', equipmentId, from, to] as const,
  funding: (userId?: string) => ['funding', userId ?? 'me'] as const,
};

export function useAvailability(equipmentId: string, range: { from: string; to: string }) {
  return useQuery({
    queryKey: bookingKeys.availability(equipmentId, range.from, range.to),
    queryFn: ({ signal }) => apiFetch<Availability>(`/equipment/${equipmentId}/availability${toQueryString(range)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** The caller's funding, or (staff, proxy booking) the beneficiary's. */
export function useFunding(userId?: string) {
  return useQuery({
    queryKey: bookingKeys.funding(userId),
    queryFn: ({ signal }) => apiFetch<FundingOption[]>(`/funding/me${toQueryString({ user_id: userId })}`, { signal }),
  });
}

/** Staff search for the person a proxy booking is for. */
export function useBeneficiaries(q: string) {
  return useQuery({
    queryKey: ['bookings', 'beneficiaries', q],
    queryFn: ({ signal }) => apiFetch<PersonRef[]>(`/bookings/beneficiaries${toQueryString({ q })}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** The review step's live price: every gate runs server-side; nothing is written. */
export function useQuote(body: BookingBody | null) {
  return useQuery({
    // Not under ['bookings']: invalidating after a booking must not re-quote the slot just taken.
    queryKey: ['quote', body],
    queryFn: ({ signal }) => apiFetch<BookingQuote>('/bookings/quote', { method: 'POST', body, signal }),
    enabled: body !== null,
    retry: false,
  });
}

/** Bookings change balances, availability and funding: refresh all of them. */
function useInvalidateBookings() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['bookings'] }),
    client.invalidateQueries({ queryKey: ['funding'] }),
  ]);
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (body: BookingBody) => apiFetch<BookingCreated>('/bookings', { method: 'POST', body }),
    onSettled: () => invalidate(), // a conflict also means availability changed
  });
}

export function useBookings(query: BookingListQuery) {
  return useQuery({
    queryKey: bookingKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<BookingSummary>>(`/bookings${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useBooking(bookingId: string) {
  return useQuery({ queryKey: bookingKeys.detail(bookingId), queryFn: ({ signal }) => apiFetch<BookingDetail>(`/bookings/${bookingId}`, { signal }) });
}

export function useCancelBooking(bookingId: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (body: CancelBookingBody) => apiFetch<BookingDetail>(`/bookings/${bookingId}/cancel`, { method: 'PATCH', body }),
    onSettled: () => invalidate(),
  });
}
