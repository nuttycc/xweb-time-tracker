import type { EventsLogRecord } from '../../db/models/eventslog.model';

export interface AggregationResult {
  success: boolean;
  processedEvents: number;
  error?: string;
}

export interface VisitGroup {
  events: EventsLogRecord[];
  url: string;
}

export type AggregatedData = Map<
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

export interface Logger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}
