"use client";

interface MapTabProps {
  address: string | null;
  city: string | null;
  state: string | null;
  projectName: string;
}

export function MapTab({ address, city, state, projectName }: MapTabProps) {
  const parts = [address, city, state].filter(Boolean);
  const fullAddress = parts.join(", ");

  if (!fullAddress) {
    return (
      <div className="mt-6 rounded-lg border border-dashed p-16 text-center">
        <p className="text-sm text-muted-foreground">
          No address on file for this project. Add an address in the project settings to enable the map.
        </p>
      </div>
    );
  }

  const encodedAddress = encodeURIComponent(fullAddress);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Embed src: prefer Maps Embed API (requires key), fallback to no-key embed URL
  const embedSrc = apiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodedAddress}`
    : `https://maps.google.com/maps?q=${encodedAddress}&output=embed`;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground font-mono">{fullAddress}</p>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
        >
          Open in Google Maps →
        </a>
      </div>

      <div className="rounded-lg border overflow-hidden h-64 sm:h-96 md:h-[480px]">
        <iframe
          title={`Map of ${projectName}`}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={embedSrc}
        />
      </div>

      {!apiKey && (
        <p className="text-xs text-muted-foreground">
          To use the Google Maps Embed API, add{" "}
          <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> to your environment variables.
        </p>
      )}
    </div>
  );
}
