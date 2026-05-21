import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PacketDetails } from "./components/PacketDetails";

const FRAME_MS = 16;
const PACKET_WIDTH = 180;
const TRAILER_WIDTH = 86;
const SERVER_LEFT = 3;
const SERVER_WIDTH = 14;
const SWITCH_STAGE_LEFT = 36;
const SWITCH_STAGE_WIDTH = 15;
const TRACK_START = 14;
const TRACK_END = 94;
const SWITCH_QUEUE_LEFT = SWITCH_STAGE_LEFT;
const MONITOR_LEFT = 69;
const MONITOR_WIDTH = 26;
const INGRESS_MS = 1400;
const QUEUE_DWELL_MS = 900;
const PASS_THROUGH_DWELL_MS = 180;
const EGRESS_MS = 1400;
const MIN_PACKET_BYTES = 64;
const MAX_PACKET_BYTES = 1500;
const NON_QUEUED_STREAM_INTERVAL_MS = 2400;
const IPG_BYTES = 12;
const VISIBLE_SECONDS_PER_NETWORK_SECOND = 1e9;
const QUEUE_DETECTION_SLACK_RATIO = 0.05;
const NON_QUEUED_IDLE_GAP_MULTIPLIER = 2;
const BURST_PACKET_COUNT = 5;

const LINK_SPEEDS = [
  { label: "10G", bitsPerSecond: 10e9 },
  { label: "1G", bitsPerSecond: 1e9 },
  { label: "100M", bitsPerSecond: 100e6 },
  { label: "10M", bitsPerSecond: 10e6 },
] as const;

type Packet = {
  id: number;
  startedAtSimulationMs: number;
  switchArrivalTimestampSeconds: number;
  lengthBytes: number;
  timestampSeconds: number;
  egressTimestampSeconds: number;
  queueDelaySeconds: number;
  ipgMinSeconds: number;
  serializationDelaySecondsPerByte: number;
};

type QueueingEvent = {
  id: string;
  previousPacketId: number;
  packetId: number;
  gapSeconds: number;
  ipgMinSeconds: number;
  queueDelaySeconds: number;
};

function subscriptLabel(prefix: string, value: number) {
  return (
    <>
      {prefix}
      <sub>{value}</sub>
    </>
  );
}

function formatSerializationDelay(secondsPerByte: number) {
  const nanosecondsPerByte = secondsPerByte * 1e9;

  if (nanosecondsPerByte >= 1000) {
    return `${(nanosecondsPerByte / 1000).toFixed(1)} μs/byte`;
  }

  return `${nanosecondsPerByte.toFixed(3)} ns/byte`;
}

function randomPacketLength() {
  return (
    Math.floor(Math.random() * (MAX_PACKET_BYTES - MIN_PACKET_BYTES + 1)) +
    MIN_PACKET_BYTES
  );
}

function getSimulationSeconds(
  time: number,
  simulationStartAt: number | null,
  pausedAt: number | null,
  pausedDurationMs: number,
) {
  if (simulationStartAt === null) {
    return 0;
  }

  const effectiveNow = pausedAt ?? time;
  return Math.max(
    0,
    (effectiveNow - simulationStartAt - pausedDurationMs) / 1000,
  );
}

function App() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nextPacketId = useRef(0);
  const streamIntervalRef = useRef<number | null>(null);
  const simulationStartAtRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationMsRef = useRef(0);
  const serializationDelayRef = useRef(0);
  const ipgMinSecondsRef = useRef(0);
  const switchAvailableAtSimulationSecondsRef = useRef(0);
  const lastEgressTimestampSecondsRef = useRef(0);
  const [stageWidth, setStageWidth] = useState(0);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const [simulationStartAt, setSimulationStartAt] = useState<number | null>(
    null,
  );
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedDurationMs, setPausedDurationMs] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSpeed, setSelectedSpeed] =
    useState<(typeof LINK_SPEEDS)[number]["label"]>("10G");

  const selectedLink = useMemo(
    () =>
      LINK_SPEEDS.find((speed) => speed.label === selectedSpeed) ??
      LINK_SPEEDS[0],
    [selectedSpeed],
  );
  const bandwidthBitsPerSecond = useMemo(
    () => selectedLink.bitsPerSecond,
    [selectedLink],
  );
  const serializationDelay = useMemo(
    () => 8 / bandwidthBitsPerSecond,
    [bandwidthBitsPerSecond],
  );
  const ipgMinSeconds = useMemo(
    () => IPG_BYTES * serializationDelay * VISIBLE_SECONDS_PER_NETWORK_SECOND,
    [serializationDelay],
  );

  useEffect(() => {
    simulationStartAtRef.current = simulationStartAt;
    pausedAtRef.current = pausedAt;
    pausedDurationMsRef.current = pausedDurationMs;
    serializationDelayRef.current = serializationDelay;
    ipgMinSecondsRef.current = ipgMinSeconds;
  }, [
    ipgMinSeconds,
    pausedAt,
    pausedDurationMs,
    serializationDelay,
    simulationStartAt,
  ]);

  useEffect(() => {
    const node = stageRef.current;

    if (!node) {
      return;
    }

    const updateWidth = () => {
      setStageWidth(node.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (simulationStartAt === null) {
      return;
    }

    if (pausedAt !== null) {
      return;
    }

    const interval = window.setInterval(() => {
      const frameNow = performance.now();
      setNow(frameNow);
    }, FRAME_MS);

    return () => window.clearInterval(interval);
  }, [pausedAt, simulationStartAt]);

  const monitorMidpointPx = useMemo(() => {
    if (stageWidth === 0) {
      return 0;
    }

    return (stageWidth * (MONITOR_LEFT + MONITOR_WIDTH / 2)) / 100;
  }, [stageWidth]);

  const simulationClockSeconds = useMemo(() => {
    return getSimulationSeconds(
      now,
      simulationStartAt,
      pausedAt,
      pausedDurationMs,
    );
  }, [now, pausedAt, pausedDurationMs, simulationStartAt]);

  const createPacket = useCallback(() => {
    const currentSimulationStartAt = simulationStartAtRef.current;
    const currentPausedAt = pausedAtRef.current;

    if (currentSimulationStartAt === null || currentPausedAt !== null) {
      return;
    }

    const startedAt = performance.now();
    const id = nextPacketId.current;
    const lengthBytes = randomPacketLength();
    const currentSerializationDelay = serializationDelayRef.current;
    const currentIpgMinSeconds = ipgMinSecondsRef.current;
    const startedAtSimulationSeconds = getSimulationSeconds(
      startedAt,
      currentSimulationStartAt,
      currentPausedAt,
      pausedDurationMsRef.current,
    );
    const switchArrivalTimestampSeconds =
      startedAtSimulationSeconds + INGRESS_MS / 1000;
    const switchTransmitAtSeconds = Math.max(
      switchArrivalTimestampSeconds,
      switchAvailableAtSimulationSecondsRef.current,
    );
    const queueDelaySeconds = Math.max(
      0,
      switchTransmitAtSeconds - switchArrivalTimestampSeconds,
    );
    const nonQueuedIdleGapSeconds =
      currentIpgMinSeconds * NON_QUEUED_IDLE_GAP_MULTIPLIER;
    const previousEgressTimestampSeconds =
      lastEgressTimestampSecondsRef.current;
    const timestampSeconds =
      id === 0
        ? switchArrivalTimestampSeconds
        : queueDelaySeconds > 0
          ? previousEgressTimestampSeconds + currentIpgMinSeconds
          : Math.max(
              switchArrivalTimestampSeconds,
              previousEgressTimestampSeconds +
                currentIpgMinSeconds +
                nonQueuedIdleGapSeconds,
            );
    const visibleSerializationSeconds =
      lengthBytes *
      currentSerializationDelay *
      VISIBLE_SECONDS_PER_NETWORK_SECOND;
    const egressTimestampSeconds =
      timestampSeconds + visibleSerializationSeconds;

    switchAvailableAtSimulationSecondsRef.current =
      switchTransmitAtSeconds + PASS_THROUGH_DWELL_MS / 1000;
    lastEgressTimestampSecondsRef.current = egressTimestampSeconds;
    nextPacketId.current += 1;
    setNow(startedAt);
    setPackets((current) => [
      ...current,
      {
        id,
        startedAtSimulationMs: startedAtSimulationSeconds * 1000,
        switchArrivalTimestampSeconds,
        lengthBytes,
        timestampSeconds,
        egressTimestampSeconds,
        queueDelaySeconds,
        ipgMinSeconds: currentIpgMinSeconds,
        serializationDelaySecondsPerByte: currentSerializationDelay,
      },
    ]);
  }, []);

  const visiblePackets = useMemo(() => {
    return packets
      .filter((packet) => {
        const dwellMs =
          packet.queueDelaySeconds > 0 ? QUEUE_DWELL_MS : PASS_THROUGH_DWELL_MS;

        return (
          simulationClockSeconds * 1000 - packet.startedAtSimulationMs <
          INGRESS_MS + dwellMs + EGRESS_MS
        );
      })
      .map((packet) => {
        const elapsedMs =
          simulationClockSeconds * 1000 - packet.startedAtSimulationMs;
        const dwellMs =
          packet.queueDelaySeconds > 0 ? QUEUE_DWELL_MS : PASS_THROUGH_DWELL_MS;

        const packetLeft = (() => {
          if (elapsedMs < INGRESS_MS) {
            const progress = elapsedMs / INGRESS_MS;
            return TRACK_START + progress * (SWITCH_QUEUE_LEFT - TRACK_START);
          }

          if (elapsedMs < INGRESS_MS + dwellMs) {
            return SWITCH_QUEUE_LEFT;
          }

          const progress = (elapsedMs - INGRESS_MS - dwellMs) / EGRESS_MS;
          return SWITCH_QUEUE_LEFT + progress * (TRACK_END - SWITCH_QUEUE_LEFT);
        })();

        const packetCenterPx =
          stageWidth > 0
            ? (stageWidth * packetLeft) / 100 + PACKET_WIDTH / 2
            : 0;
        const showTrailer =
          packetCenterPx >= monitorMidpointPx ||
          elapsedMs >= INGRESS_MS + dwellMs;

        return {
          ...packet,
          packetLeft,
          showTrailer,
        };
      });
  }, [monitorMidpointPx, packets, simulationClockSeconds, stageWidth]);

  const queueingEvents = useMemo<QueueingEvent[]>(() => {
    return packets
      .slice(1)
      .map((packet, index) => {
        const previousPacket = packets[index];
        const gapSeconds =
          packet.timestampSeconds - previousPacket.egressTimestampSeconds;
        const slackSeconds = Math.max(
          0.5,
          packet.ipgMinSeconds * QUEUE_DETECTION_SLACK_RATIO,
        );
        const isQueueingEvent =
          packet.queueDelaySeconds > 0 ||
          gapSeconds <= packet.ipgMinSeconds + slackSeconds;

        if (!isQueueingEvent) {
          return null;
        }

        return {
          id: `${previousPacket.id}-${packet.id}`,
          previousPacketId: previousPacket.id,
          packetId: packet.id,
          gapSeconds,
          ipgMinSeconds: packet.ipgMinSeconds,
          queueDelaySeconds: packet.queueDelaySeconds,
        };
      })
      .filter((event): event is QueueingEvent => event !== null);
  }, [packets]);

  useEffect(() => {
    if (!isStreaming || simulationStartAt === null || pausedAt !== null) {
      if (streamIntervalRef.current !== null) {
        window.clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }

      return;
    }

    const interval = window.setInterval(() => {
      createPacket();
    }, NON_QUEUED_STREAM_INTERVAL_MS);

    streamIntervalRef.current = interval;

    return () => {
      window.clearInterval(interval);
      if (streamIntervalRef.current === interval) {
        streamIntervalRef.current = null;
      }
    };
  }, [createPacket, isStreaming, pausedAt, simulationStartAt]);

  const startSimulation = () => {
    const startedAt = performance.now();
    const shouldStayPaused = pausedAt !== null;
    nextPacketId.current = 0;
    switchAvailableAtSimulationSecondsRef.current = 0;
    lastEgressTimestampSecondsRef.current = 0;
    setIsStreaming(false);
    setSimulationStartAt(startedAt);
    setPausedDurationMs(0);
    setNow(startedAt);
    setPackets([]);

    if (shouldStayPaused) {
      setPausedAt(startedAt);
      return;
    }

    setPausedAt(null);
  };

  const sendPacket = () => {
    createPacket();
  };

  const sendBurst = () => {
    if (simulationStartAt === null || pausedAt !== null) {
      return;
    }

    for (
      let packetIndex = 0;
      packetIndex < BURST_PACKET_COUNT;
      packetIndex += 1
    ) {
      createPacket();
    }
  };

  const toggleStream = () => {
    if (simulationStartAt === null || pausedAt !== null) {
      return;
    }

    if (!isStreaming) {
      createPacket();
    }

    setIsStreaming((current) => !current);
  };

  const togglePauseSimulation = () => {
    if (simulationStartAt === null) {
      return;
    }

    if (pausedAt === null) {
      const pauseTime = performance.now();
      setNow(pauseTime);
      setPausedAt(pauseTime);
      setIsStreaming(false);
      return;
    }

    const resumeTime = performance.now();
    setPausedDurationMs((current) => current + (resumeTime - pausedAt));
    setPausedAt(null);
    setNow(resumeTime);
  };

  return (
    <main className="flex min-h-screen justify-center px-6 py-10">
      <div className="flex w-full max-w-7xl flex-col items-center gap-10">
        <div className="flex max-w-3xl flex-col items-center gap-2 text-center">
          <h1 className="m-0 text-4xl font-semibold">
            Packet Queueing Detection
          </h1>
          <p className="m-0 text-sm" style={{ color: "#525252" }}>
            This visualisation shows how packet queueing can be detected on a
            Layer 2 link.
          </p>
          <p className="m-0 text-sm" style={{ color: "#525252" }}>
            Read my{" "}
            <a
              href="https://prnvbn.dev/posts/packet-queueing/"
              target="_blank"
              rel="noreferrer"
              className="underline"
              style={{ color: "#111111" }}
            >
              blog post on detecting packet queueing
            </a>
            .
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-6 text-lg">
            <label className="flex items-center gap-3">
              <span>B</span>
              <select
                value={selectedSpeed}
                onChange={(event) =>
                  setSelectedSpeed(
                    event.target.value as (typeof LINK_SPEEDS)[number]["label"],
                  )
                }
                className="px-3 py-2"
                style={{
                  border: "1px solid #6b6b6b",
                  background: "#ffffff",
                  color: "#111111",
                }}
              >
                {LINK_SPEEDS.map((speed) => (
                  <option key={speed.label} value={speed.label}>
                    {speed.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-3">
              <span>α</span>
              <span style={{ color: "#111111" }}>
                {formatSerializationDelay(serializationDelay)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>clock</span>
              <span style={{ color: "#111111" }}>
                {simulationClockSeconds.toFixed(3)} s
              </span>
            </div>
          </div>

          <p className="m-0 text-sm" style={{ color: "#525252" }}>
            In this simulation, 1 ns is shown at roughly the scale of 1 s so the
            timing is visible.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={startSimulation}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background: "#ffffff",
              color: "#111111",
              cursor: "pointer",
            }}
          >
            Start simulation
          </button>

          <button
            type="button"
            onClick={sendPacket}
            disabled={simulationStartAt === null || pausedAt !== null}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background:
                simulationStartAt === null || pausedAt !== null
                  ? "#f3f4f6"
                  : "#ffffff",
              color: "#111111",
              cursor:
                simulationStartAt === null || pausedAt !== null
                  ? "default"
                  : "pointer",
            }}
          >
            Send packet
          </button>

          <button
            type="button"
            onClick={sendBurst}
            disabled={simulationStartAt === null || pausedAt !== null}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background:
                simulationStartAt === null || pausedAt !== null
                  ? "#f3f4f6"
                  : "#ffffff",
              color: "#111111",
              cursor:
                simulationStartAt === null || pausedAt !== null
                  ? "default"
                  : "pointer",
            }}
          >
            Send burst
          </button>

          <button
            type="button"
            onClick={toggleStream}
            disabled={simulationStartAt === null || pausedAt !== null}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background:
                simulationStartAt === null || pausedAt !== null
                  ? "#f3f4f6"
                  : "#ffffff",
              color: "#111111",
              cursor:
                simulationStartAt === null || pausedAt !== null
                  ? "default"
                  : "pointer",
            }}
          >
            {isStreaming ? "Stop stream" : "Start stream"}
          </button>

          <button
            type="button"
            onClick={togglePauseSimulation}
            disabled={simulationStartAt === null}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background: simulationStartAt === null ? "#f3f4f6" : "#ffffff",
              color: "#111111",
              cursor: simulationStartAt === null ? "default" : "pointer",
            }}
          >
            {pausedAt === null ? "Pause simulation" : "Resume simulation"}
          </button>

          <button
            type="button"
            onClick={startSimulation}
            className="inline-flex items-center justify-center px-5 py-3 text-lg"
            style={{
              border: "1px solid #6b6b6b",
              background: "#ffffff",
              color: "#111111",
              cursor: "pointer",
            }}
          >
            Reset simulation
          </button>
        </div>

        <div
          ref={stageRef}
          className="relative h-[340px] w-full max-w-[1400px] overflow-hidden"
          style={{ border: "1px solid #737373", background: "#ffffff" }}
        >
          <div
            className="relative h-full w-full"
            style={{ background: "#ffffff" }}
          >
            <div
              className="absolute top-1/2 flex h-[180px] -translate-y-1/2 items-center justify-center"
              style={{
                left: `${SERVER_LEFT}%`,
                width: `${SERVER_WIDTH}%`,
                border: "1px solid #737373",
                background: "#f5f5f5",
              }}
            >
              <div
                className="flex h-[82px] w-[82px] items-center justify-center text-xl"
                style={{
                  border: "1px solid #a3a3a3",
                  background: "#ffffff",
                  color: "#525252",
                }}
              >
                SRV
              </div>
            </div>

            <div
              className="absolute top-1/2 flex h-[160px] -translate-y-1/2 items-center justify-center"
              style={{
                left: `${SWITCH_STAGE_LEFT}%`,
                width: `${SWITCH_STAGE_WIDTH}%`,
                border: "1px solid #737373",
                background: "#f5f5f5",
              }}
            >
              <div
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-lg"
                style={{
                  border: "1px solid #a3a3a3",
                  background: "#ffffff",
                  color: "#525252",
                }}
              >
                SW
              </div>
            </div>

            <div
              className="absolute top-1/2 flex h-[210px] -translate-y-1/2 items-center justify-center"
              style={{
                left: `${MONITOR_LEFT}%`,
                width: `${MONITOR_WIDTH}%`,
                border: "1px solid #737373",
                background: "#f5f5f5",
              }}
            >
              <div
                className="flex h-[84px] w-[84px] items-center justify-center rounded-full text-xl"
                style={{
                  border: "1px solid #a3a3a3",
                  background: "#ffffff",
                  color: "#525252",
                }}
              >
                MW
              </div>
            </div>

            {visiblePackets.map((packet) => (
              <div
                key={packet.id}
                className="absolute top-1/2 flex h-[120px] -translate-y-1/2"
                style={{
                  left: `${packet.packetLeft}%`,
                }}
              >
                <div
                  className="flex h-full items-center justify-center text-[22px]"
                  style={{
                    width: `${PACKET_WIDTH}px`,
                    border: "1px solid #2f86b8",
                    background: "#9ec7dd",
                    color: "#111111",
                  }}
                >
                  {subscriptLabel("P", packet.id)}
                </div>

                {packet.showTrailer ? (
                  <div
                    className="flex h-full items-center justify-center text-[20px]"
                    style={{
                      width: `${TRAILER_WIDTH}px`,
                      borderTop: "1px solid #737373",
                      borderRight: "1px solid #737373",
                      borderBottom: "1px solid #737373",
                      background: "#f5f5f5",
                      color: "#111111",
                    }}
                  >
                    {subscriptLabel("T", packet.id)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <PacketDetails packets={packets} queueingEvents={queueingEvents} />
      </div>
    </main>
  );
}

export default App;
