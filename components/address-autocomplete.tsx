"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

interface AddressAutocompleteProps {
  defaultAddress?: string;
  defaultCity?: string;
  defaultState?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    initAddressAutocomplete?: () => void;
  }
}

/**
 * Drop-in replacement for the Street Address / City / State row in the project form.
 * When the user selects a suggestion, it fills in address, city, and state automatically.
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in environment variables.
 * If the key is absent, it falls back to plain text inputs.
 */
export function AddressAutocomplete({
  defaultAddress = "",
  defaultCity = "",
  defaultState = "",
}: AddressAutocompleteProps) {
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<unknown>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  function initAutocomplete() {
    if (!addressRef.current || !window.google?.maps?.places) return;

    // Restrict to US addresses only (remove the componentRestrictions line to allow worldwide)
    const autocomplete = new window.google.maps.places.Autocomplete(addressRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
      fields: ["address_components", "formatted_address"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      let streetNumber = "";
      let route = "";
      let city = "";
      let state = "";

      for (const component of place.address_components) {
        const types: string[] = component.types;
        if (types.includes("street_number")) streetNumber = component.long_name;
        if (types.includes("route")) route = component.short_name;
        if (types.includes("locality")) city = component.long_name;
        // fallback for cities that use sublocality
        if (!city && types.includes("sublocality_level_1")) city = component.long_name;
        if (types.includes("administrative_area_level_1")) state = component.short_name;
      }

      const street = [streetNumber, route].filter(Boolean).join(" ");

      if (addressRef.current) addressRef.current.value = street;
      if (cityRef.current) cityRef.current.value = city;
      if (stateRef.current) stateRef.current.value = state;
    });

    autocompleteRef.current = autocomplete;
  }

  // Re-init if the Maps script is already loaded when this component mounts
  useEffect(() => {
    if (window.google?.maps?.places) {
      initAutocomplete();
    }
  }, []);

  return (
    <>
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`}
          strategy="lazyOnload"
          onLoad={initAutocomplete}
        />
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="address">
            Street Address
            {apiKey && (
              <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(autocomplete enabled)</span>
            )}
          </label>
          <input
            ref={addressRef}
            id="address"
            name="address"
            defaultValue={defaultAddress}
            placeholder="e.g. 123 Main St"
            autoComplete="off"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="city">
            City
          </label>
          <input
            ref={cityRef}
            id="city"
            name="city"
            defaultValue={defaultCity}
            placeholder="e.g. Milwaukee"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="state">
            State
          </label>
          <input
            ref={stateRef}
            id="state"
            name="state"
            maxLength={2}
            defaultValue={defaultState}
            placeholder="WI"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm uppercase"
          />
        </div>
      </div>
    </>
  );
}
