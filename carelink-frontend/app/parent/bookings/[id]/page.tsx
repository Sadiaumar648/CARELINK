"use client";

import { use } from "react";
import { BookingDetail } from "@/components/booking-detail";

export default function ParentBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BookingDetail id={id} viewerRole="parent" />;
}
