import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { waitingRoomApi } from "../api/events";
import { getQueueSessionId } from "../lib/session";

export interface WaitingRoomHookResult {
  /** null while we don't yet know if a waiting room applies at all. */
  locked: boolean | null;
  position?: number;
  queueLength?: number;
  sessionId: string;
}

/**
 * Call this alongside the gated query (event detail / seat-map state).
 * `lockedError` is whatever axios error the gated query most recently
 * threw — the hook inspects it for a 423 and, if found, joins the queue
 * and polls status every 3s until admitted, at which point the caller's
 * query should be refetched (React Query will naturally retry once
 * `enabled`/queryKey conditions change — see EventDetailPage for the wiring).
 */
export function useWaitingRoom(eventId: string, lockedError: unknown, onAdmitted: () => void): WaitingRoomHookResult {
  const sessionId = getQueueSessionId();
  const [locked, setLocked] = useState<boolean | null>(null);
  const [initialPosition, setInitialPosition] = useState<{ position?: number; queueLength?: number }>({});

  useEffect(() => {
    if (!axios.isAxiosError(lockedError) || lockedError.response?.status !== 423) return;
    setLocked(true);
    const body = lockedError.response.data as { position?: number; queueLength?: number };
    setInitialPosition(body);
    waitingRoomApi.join(eventId, sessionId).catch(() => undefined);
  }, [lockedError, eventId, sessionId]);

  const { data } = useQuery({
    queryKey: ["waiting-room", eventId, sessionId],
    queryFn: () => waitingRoomApi.status(eventId, sessionId),
    enabled: locked === true,
    refetchInterval: (q) => (q.state.data?.admitted ? false : 3000),
  });

  useEffect(() => {
    if (data?.admitted) {
      setLocked(false);
      onAdmitted();
    }
  }, [data?.admitted, onAdmitted]);

  return {
    locked,
    position: data?.position ?? initialPosition.position,
    queueLength: data?.queueLength ?? initialPosition.queueLength,
    sessionId,
  };
}
