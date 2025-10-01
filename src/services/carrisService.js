import fetch from "node-fetch";
import { FeedMessage } from "@google/transit-realtime"; // decodificador protobuf

const TRANSITLAND_URL = "https://transit.land/feeds/f-carris~pt/vehicle_positions";

export async function getVeiculos12E() {
  try {
    const res = await fetch(TRANSITLAND_URL);
    const buffer = await res.arrayBuffer();
    const feed = FeedMessage.decode(new Uint8Array(buffer));

    // Filtrar só a carreira 12E
    const veiculos12E = feed.entity.filter(e =>
      e.vehicle?.trip?.routeId === "12E"
    );

    return veiculos12E.map(v => ({
      id: v.id,
      lat: v.vehicle.position.latitude,
      lon: v.vehicle.position.longitude,
      rota: v.vehicle.trip.routeId,
      chapa: v.vehicle.vehicle?.id || "Desconhecido"
    }));
  } catch (err) {
    console.error("Erro no CarrisService:", err);
    return [];
  }
}