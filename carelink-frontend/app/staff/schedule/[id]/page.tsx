"use client";

import { use } from "react";
import { BookingDetail } from "@/components/booking-detail";

export default function StaffBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BookingDetail id={id} viewerRole="staff" />;
}
