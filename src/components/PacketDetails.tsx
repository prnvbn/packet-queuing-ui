type PacketDetailsItem = {
  id: number;
  switchArrivalTimestampSeconds: number;
  lengthBytes: number;
  timestampSeconds: number;
  egressTimestampSeconds: number;
  queueDelaySeconds: number;
};

type QueueingEventDetailsItem = {
  id: string;
  previousPacketId: number;
  packetId: number;
  gapSeconds: number;
  ipgMinSeconds: number;
  queueDelaySeconds: number;
};

type PacketDetailsProps = {
  packets: PacketDetailsItem[];
  queueingEvents: QueueingEventDetailsItem[];
};

function subscriptLabel(prefix: string, value: number) {
  return (
    <>
      {prefix}
      <sub>{value}</sub>
    </>
  );
}

function formatSimulationSeconds(value: number) {
  return `${value.toFixed(3)} s`;
}

const headerCellStyle = {
  borderBottom: "1px solid #d4d4d4",
  color: "#525252",
} as const;

const cellStyle = {
  borderBottom: "1px solid #e5e5e5",
  color: "#111111",
} as const;

export function PacketDetails({
  packets,
  queueingEvents,
}: PacketDetailsProps) {
  return (
    <div className="grid h-[320px] w-full max-w-[1200px] grid-cols-1 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="m-0 text-lg font-normal">Packet stats</h2>

        <div className="overflow-x-auto" style={{ border: "1px solid #d4d4d4" }}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Packet
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Length
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Switch arrival
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  T
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  T'
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Queue wait
                </th>
              </tr>
            </thead>
            <tbody>
              {packets.length === 0 ? (
                <tr>
                  <td className="px-3 py-3" colSpan={6} style={cellStyle}>
                    Start the simulation and send a packet to populate packet
                    timing.
                  </td>
                </tr>
              ) : (
                packets.map((packet) => (
                  <tr
                    key={`details-${packet.id}`}
                    className={
                      packet.queueDelaySeconds > 0 ? "queueing-flash-row" : ""
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {subscriptLabel("P", packet.id)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {packet.lengthBytes} bytes
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(
                        packet.switchArrivalTimestampSeconds,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(packet.timestampSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(packet.egressTimestampSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(packet.queueDelaySeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="m-0 text-lg font-normal">Queueing events</h2>

        <div className="overflow-x-auto" style={{ border: "1px solid #d4d4d4" }}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Event
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Packets
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Tᵢ - Tᵢ₋₁'
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  IPG min
                </th>
                <th className="whitespace-nowrap px-3 py-2" style={headerCellStyle}>
                  Queue wait
                </th>
              </tr>
            </thead>
            <tbody>
              {queueingEvents.length === 0 ? (
                <tr>
                  <td className="px-3 py-3" colSpan={5} style={cellStyle}>
                    No queueing events detected yet.
                  </td>
                </tr>
              ) : (
                queueingEvents.map((event, index) => (
                  <tr key={event.id} className="queueing-flash-row">
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      E{index}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {subscriptLabel("P", event.previousPacketId)} →{" "}
                      {subscriptLabel("P", event.packetId)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(event.gapSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(event.ipgMinSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2" style={cellStyle}>
                      {formatSimulationSeconds(event.queueDelaySeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
