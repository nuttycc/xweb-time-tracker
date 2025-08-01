import type { EventsLogRecord } from '@/core/db/models/eventslog.model';

export interface AggregationResult {
  success: boolean;
  processedEvents: number;
  error?: string;
}

export interface VisitGroup {
  events: EventsLogRecord[];
  url: string;
}

export type AggregatedData = Record<
  string,
  {
    openTime: number;
    activeTime: number;
    url: string;
    date: string;
    hostname: string;
    parentDomain: string;
  }
>;


